import { randomUUID } from 'node:crypto';
import type { AppAvecBase } from '../partie-5/outils.js';
import { SECRET, SECRET_REFRESH } from '../partie-7/outils.js';
import { chargerExport, clientRedis, lancerP10, verifierRedisJoignable, viderRedis } from './outils.js';

// 10.8 : les compteurs de la limitation de débit dans Redis ; 10.15 : `trust proxy`, derrière un
// reverse proxy. Ces tests vident le Redis des tests (FLUSHDB), comme le `beforeEach` du cours.
// À faire toi-même : le lancement répété de ton fichier des abus sans `flushdb` (10.8, noter le statut),
// les essais avec Compose (10.8), et le déploiement de 10.15.

type Valider = (config: Record<string, unknown>) => Record<string, unknown>;
interface Stockage {
  increment(cle: string, ttl: number, limite: number, blocage: number, nom: string): Promise<{ totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number }>;
}

const complet = { NODE_ENV: 'production', DB_HOST: 'db', DB_USER: 'm', DB_PASSWORD: 'm', DB_NAME: 'm', NOMBRE_MAX_PRODUITS: '50', JWT_SECRET: SECRET, JWT_REFRESH_SECRET: SECRET_REFRESH, REDIS_HOST: 'redis' };
const MAUVAISE = { email: 'fantome@exemple.fr', motDePasse: 'PasLeBonMotDePasse' };
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `n` connexions ratées ; leurs statuts. */
async function connexionsRatees(lancee: AppAvecBase, n: number, ip?: () => string): Promise<number[]> {
  const statuts: number[] = [];
  for (let i = 0; i < n; i++) {
    const requete = lancee.http().post('/api/auth/connexion');
    if (ip) requete.set('X-Forwarded-For', ip());
    statuts.push((await requete.send(MAUVAISE)).status);
  }
  return statuts;
}

describe('Partie 10 · Redis (exercices 10.8 et 10.15)', () => {
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      await verifierRedisJoignable();
    } catch (erreur) {
      echec = erreur;
    }
  });

  describe('10.8 · le compteur partagé', () => {
    it('la validation exige REDIS_HOST, et REDIS_PORT vaut 6379 par défaut', async () => {
      const valider = await chargerExport<Valider>('validerEnvironnement', 'Exporte `validerEnvironnement` (exercices 4.13 et 10.1).');
      let message = '';
      try {
        valider(Object.fromEntries(Object.entries(complet).filter(([k]) => k !== 'REDIS_HOST')));
      } catch (erreur) {
        message = (erreur as Error).message;
      }
      expect(message, 'ajoute `REDIS_HOST` (`@IsString()`, `@IsNotEmpty()`) à ta validation d\'environnement').toContain('REDIS_HOST');
      expect(valider(complet).REDIS_PORT, '`REDIS_PORT: number = 6379` (`@IsNumber()`)').toBe(6379);
      expect(valider({ ...complet, REDIS_PORT: '6380' }).REDIS_PORT, 'REDIS_PORT converti en nombre').toBe(6380);
    });

    describe('RedisThrottlerStorage, sur le Redis des tests', () => {
      let stockage: Stockage;
      const redis = clientRedis();
      let absent: unknown;
      beforeEach(() => {
        if (absent) throw absent;
      });
      beforeAll(async () => {
        try {
          const Classe = await chargerExport<new (redis: unknown) => Stockage>('RedisThrottlerStorage', 'Écris `export class RedisThrottlerStorage implements ThrottlerStorage` (src/redis/redis-throttler.storage.ts, exercice 10.8).');
          await redis.connect();
          stockage = new Classe(redis);
          if (typeof stockage.increment !== 'function') throw new Error('RedisThrottlerStorage doit avoir une méthode `increment(cle, ttl, limite, blocage, nom)`.');
        } catch (erreur) {
          absent = erreur;
        }
      });
      afterAll(() => redis.quit().catch(() => undefined));

      it('compte les appels, et bloque au-delà de la limite', async () => {
        const cle = `essai-${randomUUID()}`;
        const resultats = [];
        for (let i = 0; i < 3; i++) resultats.push(await stockage.increment(cle, 60_000, 2, 0, 'default'));
        expect(resultats.map((r) => Number(r.totalHits)), 'totalHits : 1, puis 2, puis 3 (`INCR`)').toEqual([1, 2, 3]);
        expect(resultats.map((r) => r.isBlocked), 'isBlocked dès que totalHits dépasse la limite (2)').toEqual([false, false, true]);
        for (const r of resultats) expect(r.timeToExpire, 'timeToExpire : les secondes qui restent dans la fenêtre (60 ici)').toBeGreaterThan(0);
        expect(resultats[0]!.timeToExpire, 'timeToExpire en secondes, pas en millisecondes').toBeLessThanOrEqual(60);
        expect(resultats[2]!.timeToBlockExpire, 'bloqué : timeToBlockExpire > 0').toBeGreaterThan(0);
      });

      it('la fenêtre part du premier appel, puis repart de zéro (PEXPIRE … NX, PTTL)', async () => {
        const cle = `fenetre-${randomUUID()}`;
        await stockage.increment(cle, 800, 5, 0, 'default');
        await attendre(500);
        const deuxieme = await stockage.increment(cle, 800, 5, 0, 'default');
        expect(Number(deuxieme.totalHits)).toBe(2);
        // 950 ms après le premier appel : la fenêtre de 800 ms est finie (si le second appel ne l'a pas relancée).
        await attendre(450);
        const apres = await stockage.increment(cle, 800, 5, 0, 'default');
        expect(
          Number(apres.totalHits),
          'la durée de vie n\'est posée qu\'au PREMIER appel de la fenêtre (`pexpire(k, ttl, \'NX\')`) : à chaque appel, elle repousserait la fin de la fenêtre ; sans elle, le compteur ne repartirait jamais de zéro',
        ).toBe(1);
      });

      it('deux noms de limite, ou deux clés, ont chacun leur compteur', async () => {
        const cle = `separe-${randomUUID()}`;
        await stockage.increment(cle, 60_000, 5, 0, 'default');
        await stockage.increment(cle, 60_000, 5, 0, 'default');
        expect(Number((await stockage.increment(cle, 60_000, 5, 0, 'autre')).totalHits), 'le nom de la limite fait partie de la clé Redis (`limite:${nom}:${cle}`)').toBe(1);
        expect(Number((await stockage.increment(`${cle}-b`, 60_000, 5, 0, 'default')).totalHits)).toBe(1);
      });
    });

    it('les compteurs survivent au redémarrage : 5 connexions ratées, une nouvelle application, la 6e répond 429', async () => {
      await viderRedis();
      const premiere = await lancerP10({ env: { THROTTLE_ACTIF: 'true' } });
      let statuts: number[];
      try {
        statuts = await connexionsRatees(premiere, 5);
      } finally {
        await premiere.fermer();
      }
      expect(statuts, 'les cinq premières tentatives passent (401)').toEqual([401, 401, 401, 401, 401]);
      const seconde = await lancerP10({ env: { THROTTLE_ACTIF: 'true' } });
      try {
        const [sixieme] = await connexionsRatees(seconde, 1);
        expect(
          sixieme,
          'après un redémarrage, la 6e tentative doit être refusée (429) : branche `storage: new RedisThrottlerStorage(redis)` dans `ThrottlerModule.forRootAsync` (avec `inject: [REDIS]`), sinon les compteurs restent dans la mémoire de l\'application',
        ).toBe(429);
      } finally {
        await seconde.fermer();
        await viderRedis();
      }
    });

    it('RedisModule : le client Redis est injectable avec le jeton REDIS, et fermé à l\'arrêt', async () => {
      const REDIS = await chargerExport<string | symbol>('REDIS', 'Exporte le jeton `REDIS` de src/redis/redis.module.ts (exercice 10.8).');
      const lancee = await lancerP10();
      let client: { ping?: () => Promise<string>; status?: string } | undefined;
      try {
        client = lancee.app.get(REDIS, { strict: false }) as typeof client;
        expect(typeof client?.ping, '`{ provide: REDIS, useFactory: (config) => new Redis({ host: config.get(\'REDIS_HOST\'), port: config.get(\'REDIS_PORT\') }) }`').toBe('function');
        expect(await client!.ping!(), 'le client répond au Redis des tests (REDIS_HOST, REDIS_PORT lus avec ConfigService)').toBe('PONG');
      } finally {
        await lancee.fermer();
      }
      await attendre(50);
      expect(client?.status, 'à l\'arrêt de l\'application, la connexion est fermée : `onApplicationShutdown() { await this.redis.quit(); }`').toMatch(/^(end|close|closing|wait)$/);
    });
  });

  describe('10.15 · derrière un proxy : trust proxy', () => {
    let lancee: AppAvecBase | undefined;
    beforeAll(async () => {
      try {
        lancee = await lancerP10({ env: { THROTTLE_ACTIF: 'true' } });
      } catch (erreur) {
        echec = erreur;
      }
    });
    beforeEach(() => viderRedis());
    afterAll(async () => {
      await lancee?.fermer();
      await viderRedis().catch(() => undefined);
    });

    it('chaque client est compté à part, d\'après X-Forwarded-For', async () => {
      expect(await connexionsRatees(lancee!, 5, () => '203.0.113.1'), 'cinq connexions ratées depuis 203.0.113.1').toEqual([401, 401, 401, 401, 401]);
      expect((await connexionsRatees(lancee!, 1, () => '203.0.113.1'))[0], 'la sixième depuis 203.0.113.1 : 429').toBe(429);
      expect(
        (await connexionsRatees(lancee!, 1, () => '203.0.113.2'))[0],
        'une autre adresse (203.0.113.2) n\'est pas bloquée : `app.getHttpAdapter().getInstance().set(\'trust proxy\', 1)` dans configurerApp (sans lui, tous les clients partagent un compteur)',
      ).toBe(401);
    });

    it('ne fait confiance qu\'à UN intermédiaire : l\'adresse est celle qu\'écrit le proxy, pas celle que le client invente', async () => {
      let n = 0;
      // Le client écrit ce qu'il veut en tête de X-Forwarded-For ; le proxy ajoute la vraie adresse à la fin.
      const statuts = await connexionsRatees(lancee!, 6, () => `198.51.100.${++n}, 203.0.113.9`);
      expect(
        statuts,
        'avec `\'trust proxy\', true`, Express croit la première adresse de la liste, que le client invente : il ne serait jamais limité. `\'trust proxy\', 1` ne croit que le dernier intermédiaire',
      ).toEqual([401, 401, 401, 401, 401, 429]);
    });
  });
});
