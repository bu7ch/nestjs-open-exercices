import { DataSource } from 'typeorm';
import type { AppAvecBase } from '../partie-5/outils.js';
import { donnees } from '../partie-8/outils.js';
import { chargerExport, lancerP10, viderRedis } from './outils.js';

// 10.10 : vivant (/sante) et prêt (/sante/pret). L'application tourne avec la limitation ACTIVE
// (THROTTLE_ACTIF=true) : sinon, `skipIf` couperait le throttler et l'en-tête X-RateLimit-Limit
// manquerait même sans `@SkipThrottle()`. Pour simuler les pannes, comme le cours : la connexion à la
// base est fermée (`destroy`), puis rouverte ; le client Redis est déconnecté, puis reconnecté.
// À faire toi-même : `docker compose kill db` et l'état `unhealthy` (10.9), le healthcheck dans Compose.

const INDICE_PRET = 'Ajoute `GET /sante/pret` avec @nestjs/terminus (`HealthCheckService.check([...])` : `pingCheck(\'base\')` et une vérification `redis`), dans `SanteController` (exercice 10.10).';

describe('Partie 10 · Vivant et prêt (exercice 10.10)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      await viderRedis();
      lancee = await lancerP10({ env: { THROTTLE_ACTIF: 'true' } });
      http = lancee.http;
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(async () => {
    await lancee?.fermer();
    await viderRedis().catch(() => undefined);
  });

  it('GET /sante (vivant) répond toujours { statut: "ok" }, sans jeton', async () => {
    const r = await http().get('/sante');
    expect(r.status, 'garde `GET /sante` de l\'exercice 8.6, publique').toBe(200);
    expect(donnees(r.body)).toEqual({ statut: 'ok' });
  });

  it('GET /sante/pret répond 200 quand la base et Redis répondent, avec le détail', async () => {
    const r = await http().get('/sante/pret');
    expect(r.status, `${INDICE_PRET} Réponse : ${JSON.stringify(r.body).slice(0, 300)}`).toBe(200);
    const rapport = donnees(r.body);
    expect(rapport?.status, 'la réponse de Terminus : `{ status: \'ok\', info, error, details }` (sous `data` après le 8.13)').toBe('ok');
    expect(rapport?.info?.base?.status, 'une vérification nommée `base` : `this.base.pingCheck(\'base\')`').toBe('up');
    expect(rapport?.info?.redis?.status, 'une vérification nommée `redis` : `this.indicateurs.check(\'redis\').attempt(async () => { await this.redis.ping(); })`').toBe('up');
  });

  it('les deux routes échappent à la limitation (@SkipThrottle) et au middleware d\'identifiant (sante{/*reste})', async () => {
    for (const route of ['/sante', '/sante/pret']) {
      const r = await http().get(route);
      expect(r.headers['x-ratelimit-limit'], `${route} ne doit pas être comptée par le throttler : \`@SkipThrottle()\` sur SanteController`).toBeUndefined();
      expect(r.headers['x-request-id'], `${route} est exclue du RequeteIdMiddleware : \`.exclude({ path: 'sante{/*reste}', method: RequestMethod.GET })\``).toBeUndefined();
    }
    const autre = await http().post('/api/auth/connexion').send({ email: 'fantome@exemple.fr', motDePasse: 'PasLeBon' });
    expect(autre.headers['x-request-id'], 'les autres routes gardent leur identifiant de requête').toBeTypeOf('string');
    expect(autre.headers['x-ratelimit-limit'], 'les autres routes restent limitées').toBeDefined();
  });

  it('base coupée : /sante/pret répond 503 avec le détail (SanteFilter), /sante reste à 200', async () => {
    const ds = lancee.app.get(DataSource);
    await ds.destroy();
    try {
      const r = await http().get('/sante/pret');
      expect(r.status, 'la base ne répond plus : `/sante/pret` doit répondre 503').toBe(503);
      expect(
        r.body?.error?.base?.status,
        `la 503 doit garder le rapport de Terminus (\`error.base.status: 'down'\`) : \`@UseFilters(SanteFilter)\` sur le contrôleur, un filtre \`@Catch(ServiceUnavailableException)\` qui renvoie \`exception.getResponse()\`. Réponse : ${JSON.stringify(r.body).slice(0, 300)}`,
      ).toBe('down');
      expect(r.body?.status).toBe('error');
      expect(r.body?.info?.redis?.status, 'Redis, lui, va bien : `info.redis.status` vaut `up`').toBe('up');
      const vivant = await http().get('/sante');
      expect(vivant.status, '« vivant » ne vérifie rien : /sante répond 200 même sans base (sinon l\'orchestrateur redémarrerait l\'API en boucle)').toBe(200);
    } finally {
      await ds.initialize();
    }
  });

  it('Redis coupé : /sante/pret répond 503 (redis down), /sante reste à 200', async () => {
    const REDIS = await chargerExport<string | symbol>('REDIS', 'Exporte le jeton `REDIS` de src/redis/redis.module.ts (exercice 10.8).');
    const redis = lancee.app.get(REDIS, { strict: false }) as { disconnect(): void; connect(): Promise<void>; status: string };
    redis.disconnect();
    try {
      const r = await http().get('/sante/pret');
      expect(r.status, 'Redis ne répond plus : `/sante/pret` doit répondre 503').toBe(503);
      expect(r.body?.error?.redis?.status, 'le rapport nomme Redis : `error.redis.status: \'down\'`').toBe('down');
      const vivant = await http().get('/sante');
      expect(
        vivant.status,
        '/sante ne doit pas dépendre de Redis : avec la limitation active, sans `@SkipThrottle()`, le throttler (qui compte dans Redis) la ferait répondre 500',
      ).toBe(200);
    } finally {
      if (redis.status === 'end' || redis.status === 'close') await redis.connect().catch(() => undefined);
    }
  });
});
