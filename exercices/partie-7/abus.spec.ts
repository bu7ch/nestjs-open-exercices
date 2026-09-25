import { readFileSync } from 'node:fs';
import type { AppAvecBase } from '../partie-5/outils.js';
import { compteConnecte, inscrire, lancerAvecAuth, messageDe, nouvelEmail } from './outils.js';

// 7.18 : la limitation de débit ; 7.19 : la porte de sortie THROTTLE_ACTIF ; 7.20 : helmet et CORS.
// Les compteurs du throttler vivent dans ton application : chaque bloc démarre la sienne, avec des
// compteurs neufs. Les fenêtres durent une minute : ces tests prennent quelques secondes, rien n'attend.
// À faire toi-même : compter les tests qui tombent avec THROTTLE_ACTIF=true (7.19), le `curl -i` du 7.20.

const TROP = 'ThrottlerException: Too Many Requests';

/** `n` connexions ratées (email inconnu), l'une après l'autre ; leurs statuts. */
async function connexionsRatees(http: AppAvecBase['http'], n: number): Promise<number[]> {
  const statuts: number[] = [];
  for (let i = 0; i < n; i++) statuts.push((await http().post('/api/auth/connexion').send({ email: 'fantome@exemple.fr', motDePasse: 'PasLeBonMotDePasse' })).status);
  return statuts;
}

/** Démarre ton application pour un bloc de tests ; l'échec de démarrage est rejoué dans chaque test. */
function application(env: Record<string, string>) {
  const etat: { lancee?: AppAvecBase; echec?: unknown } = {};
  beforeAll(async () => {
    try {
      etat.lancee = await lancerAvecAuth({ env });
    } catch (erreur) {
      etat.echec = erreur;
    }
  });
  beforeEach(() => {
    if (etat.echec) throw etat.echec;
  });
  afterAll(() => etat.lancee?.fermer());
  return etat;
}

describe('Partie 7 · Se protéger des abus (exercices 7.18 à 7.20)', () => {
  describe('7.18 · limiter la connexion (limitation active : THROTTLE_ACTIF=true)', () => {
    const etat = application({ THROTTLE_ACTIF: 'true' });

    it('cinq mauvaises connexions donnent 401, la sixième 429', async () => {
      const statuts = await connexionsRatees(etat.lancee!.http, 5);
      expect(statuts, 'les cinq premières tentatives passent (et échouent : identifiants invalides)').toEqual([401, 401, 401, 401, 401]);
      const r = await etat.lancee!.http().post('/api/auth/connexion').send({ email: 'fantome@exemple.fr', motDePasse: 'PasLeBonMotDePasse' });
      expect(r.status, 'ajoute `@Throttle({ default: { limit: 5, ttl: 60_000 } })` sur la connexion, et ThrottlerGuard avec APP_GUARD').toBe(429);
      expect(messageDe(r.body)).toBe(TROP);
    });
  });

  describe('7.18 · l\'inscription et le renouvellement (THROTTLE_ACTIF=true)', () => {
    const etat = application({ THROTTLE_ACTIF: 'true' });

    it('l\'inscription : 5 requêtes par minute, la sixième 429', async () => {
      const http = etat.lancee!.http;
      await inscrire(http);
      const statuts: number[] = [];
      for (let i = 0; i < 4; i++) statuts.push((await http().post('/api/auth/inscription').send({ email: 'pas-un-email', motDePasse: 'x' })).status);
      expect(statuts, 'ces requêtes invalides doivent encore passer (400)').toEqual([400, 400, 400, 400]);
      const r = await http().post('/api/auth/inscription').send({ email: nouvelEmail(), motDePasse: 'MotDePasse!42' });
      expect(r.status, 'la même limite stricte sur `inscription` : `@Throttle({ default: { limit: 5, ttl: 60_000 } })`').toBe(429);
      expect(messageDe(r.body)).toBe(TROP);
    });

    it('le renouvellement : 5 requêtes par minute, la sixième 429', async () => {
      const http = etat.lancee!.http;
      const statuts: number[] = [];
      for (let i = 0; i < 5; i++) statuts.push((await http().post('/api/auth/rafraichir').send({ refreshToken: 'pas-un-jeton' })).status);
      expect(statuts, 'un refresh token invalide : 401').toEqual([401, 401, 401, 401, 401]);
      const r = await http().post('/api/auth/rafraichir').send({ refreshToken: 'pas-un-jeton' });
      expect(r.status, 'la même limite stricte sur `rafraichir`').toBe(429);
    });
  });

  describe('7.18 · la limite globale (THROTTLE_ACTIF=true)', () => {
    const etat = application({ THROTTLE_ACTIF: 'true' });

    it('les autres routes : 100 requêtes par minute, la 101e 429', async () => {
      const http = etat.lancee!.http;
      const { bearer } = await compteConnecte(etat.lancee!);
      const statuts: number[] = [];
      for (let i = 0; i < 100; i++) statuts.push((await http().get('/api/auth/moi').set('Authorization', bearer)).status);
      expect(statuts.filter((s) => s !== 200), 'la limite globale doit laisser passer 100 requêtes par minute').toEqual([]);
      const r = await http().get('/api/auth/moi').set('Authorization', bearer);
      expect(r.status, '`ThrottlerModule.forRootAsync({ useFactory: () => ({ throttlers: [{ ttl: 60_000, limit: 100 }] }) })`').toBe(429);
    });
  });

  describe('7.19 · sans casser les autres tests (THROTTLE_ACTIF=false)', () => {
    const etat = application({ THROTTLE_ACTIF: 'false' });

    it('THROTTLE_ACTIF=false coupe la limitation, relue dans process.env à chaque requête', async () => {
      const http = etat.lancee!.http;
      expect(await connexionsRatees(http, 7), '`skipIf: () => process.env.THROTTLE_ACTIF === \'false\'` dans ThrottlerModule.forRootAsync').toEqual([401, 401, 401, 401, 401, 401, 401]);
      // Comme le fichier de test des abus du cours : la variable change APRÈS le démarrage.
      process.env.THROTTLE_ACTIF = 'true';
      const statuts = await connexionsRatees(http, 6);
      expect(
        statuts,
        'la limitation doit se réactiver dès que THROTTLE_ACTIF change : lis `process.env` dans `skipIf`, à chaque requête (ConfigService figerait la valeur du démarrage)',
      ).toEqual([401, 401, 401, 401, 401, 429]);
    });
  });

  describe('7.20 · en-têtes de sécurité et CORS', () => {
    const etat = application({});

    // L'origine de ton front : lue dans ton configurer-app.ts (ou main.ts) ; celle du cours sinon.
    const origines = (): string[] => {
      const trouvees = new Set<string>();
      for (const fichier of ['configurer-app.ts', 'main.ts']) {
        try {
          const source = readFileSync(new URL(`../../src/${fichier}`, import.meta.url), 'utf8');
          for (const m of source.matchAll(/['"`](https?:\/\/[^'"`\s,]+)['"`]/g)) trouvees.add(m[1]!.replace(/\/$/, ''));
        } catch {
          // fichier absent
        }
      }
      return trouvees.size > 0 ? [...trouvees] : ['http://localhost:5173'];
    };

    it('helmet : X-Content-Type-Options: nosniff, et plus de X-Powered-By', async () => {
      const r = await etat.lancee!.http().get('/api/auth/moi');
      expect(r.headers['x-content-type-options'], '`app.use(helmet())` dans configurerApp').toBe('nosniff');
      expect(r.headers['x-powered-by'], 'helmet retire X-Powered-By (qui annonce Express)').toBeUndefined();
    });

    it('CORS : l\'origine du front est autorisée, et seulement elle (jamais `*`)', async () => {
      const essais: string[] = [];
      let autorisee = false;
      for (const origine of origines()) {
        const r = await etat.lancee!.http().get('/api/auth/moi').set('Origin', origine);
        if (r.headers['access-control-allow-origin'] === origine) autorisee = true;
        else essais.push(`${origine} → ${String(r.headers['access-control-allow-origin'])}`);
      }
      if (!autorisee) throw new Error(`Aucune origine autorisée dans Access-Control-Allow-Origin (${essais.join(' ; ')}) : \`app.enableCors({ origin: ['http://localhost:5173'] })\` dans configurerApp.`);
      const r = await etat.lancee!.http().get('/api/auth/moi').set('Origin', 'http://mechant.example');
      expect(r.headers['access-control-allow-origin'], 'une origine étrangère ne doit pas être autorisée : liste les origines, et seulement elles (pas d\'étoile)').toBeUndefined();
    });
  });
});
