import { ConfigService } from '@nestjs/config';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { importer, lancer, meta, rechargerLeCode } from '../aide.js';
import { sql, tables, verifierBaseJoignable } from '../partie-5/outils.js';
import { exigerDetection, exigerMention, exigerVert, parMutation, preparerCopie, specsE2e, testsTombes, type Copie, type Execution } from './outils.js';

// 6.12 : ta base de test (.env.test, dropSchema, synchronize, garde-fou), vérifiée sur ton application.
// 6.13, 6.14 : TES tests de bout en bout avec la base, lancés dans une copie de ton projet, puis
// relancés avec des bugs introduits exprès dans les routes des vendeurs.

const racine = new URL('../../', import.meta.url);
const INDICE_E2E = 'Écris un test de bout en bout dans test/ (par exemple test/vendeurs.e2e-spec.ts), qui démarre AppModule avec configurerApp (exercice 6.13).';

const MUTATIONS: Record<string, string> = {
  'http:patch-sans-effet': 'PATCH /api/vendeurs/:id répond 200 sans rien renommer : vérifie le nouveau nom (dans la réponse ou en relisant le vendeur)',
  'http:delete-sans-effet': 'DELETE /api/vendeurs/:id répond 204 sans rien supprimer : vérifie qu\'un GET répond ensuite 404',
  'http:404-masque': 'GET /api/vendeurs/:id répond 200 pour un vendeur qui n\'existe pas : vérifie le 404',
  'http:409-masque': 'DELETE d\'un vendeur dont un produit a été commandé répond 204 au lieu de 409 : crée produit, variante et commande, puis attends le 409 (exercice 5.13)',
};

/** Lit un fichier .env (CLE=valeur par ligne). */
const lireEnv = (texte: string): Record<string, string> =>
  Object.fromEntries(
    texte
      .split('\n')
      .map((l) => /^\s*(?:export\s+)?([\w.]+)\s*=\s*(.*?)\s*$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!.replace(/^(['"])(.*)\1$/, '$2')]),
  );

/** Les noms de tables d'un `TRUNCATE a, "b", public.c RESTART IDENTITY`. */
function tablesVidees(requete: string): { tables: string[]; cascade: boolean; restart: boolean } {
  const m = /TRUNCATE\s+(?:TABLE\s+)?([\s\S]*?)(?=\s+(?:RESTART|CONTINUE)\s+IDENTITY|\s+CASCADE|\s+RESTRICT|\s*;|\s*$)/i.exec(requete);
  const noms = (m?.[1] ?? '').split(',').map((s) => s.trim().replace(/^ONLY\s+/i, '').replace(/"/g, '').split('.').pop()!.toLowerCase()).filter(Boolean);
  return { tables: noms, cascade: /\bCASCADE\b/i.test(requete), restart: /RESTART\s+IDENTITY/i.test(requete) };
}

/**
 * La fonction `useFactory` de ton `TypeOrmModule.forRootAsync(...)`, trouvée dans les imports
 * d'AppModule (chargé dans un dossier vide : ni ton .env ni ton .env.test ne sont lus).
 */
async function fabriqueTypeOrm(): Promise<((...args: unknown[]) => unknown) | undefined> {
  const dossier = mkdtempSync(join(tmpdir(), 'nestjs-open-typeorm-'));
  const initial = process.cwd();
  process.chdir(dossier);
  rechargerLeCode();
  try {
    const { AppModule } = await importer<{ AppModule: object }>('app.module', '');
    const aVisiter: unknown[] = (await Promise.allSettled(meta('imports', AppModule))).map((r) => (r.status === 'fulfilled' ? r.value : undefined));
    while (aVisiter.length > 0) {
      const m = aVisiter.shift() as { providers?: unknown[]; imports?: unknown[] } | undefined;
      if (!m || typeof m !== 'object') continue;
      for (const p of m.providers ?? []) {
        const fournisseur = p as { provide?: unknown; useFactory?: (...args: unknown[]) => unknown };
        if (fournisseur?.provide === 'TypeOrmModuleOptions' && typeof fournisseur.useFactory === 'function') return fournisseur.useFactory;
      }
      aVisiter.push(...(m.imports ?? []));
    }
    return undefined;
  } finally {
    process.chdir(initial);
    rmSync(dossier, { recursive: true, force: true });
  }
}

describe('Partie 6 · La base de données de test (exercices 6.12 à 6.14)', () => {
  describe('6.12 · une base de test pour la marketplace', () => {
    it('.env.test vise une base dont le nom finit par _test, et contient NOMBRE_MAX_PRODUITS', () => {
      const fichier = new URL('.env.test', racine);
      expect(existsSync(fichier), 'crée le fichier .env.test à la racine du dépôt (à côté de .env)').toBe(true);
      const env = lireEnv(readFileSync(fichier, 'utf8'));
      expect(env.DB_NAME, 'DB_NAME=marketplace_test dans .env.test').toMatch(/_test$/);
      for (const cle of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']) expect(env[cle], `${cle} dans .env.test : il remplace .env pendant les tests`).toBeDefined();
      expect(env.NOMBRE_MAX_PRODUITS, 'la validation de la partie 4 exige NOMBRE_MAX_PRODUITS : ajoute-la à .env.test').toBeDefined();
    });

    it('pendant les tests (NODE_ENV=test), ton application lit .env.test, et pas .env', async () => {
      await verifierBaseJoignable();
      const lancee = await lancer({
        env: { NODE_ENV: 'test', NOMBRE_MAX_PRODUITS: undefined },
        fichierEnv: 'NOMBRE_MAX_PRODUITS=3\n',
        fichiers: { '.env.test': 'NOMBRE_MAX_PRODUITS=7\n' },
      }).catch((erreur: unknown) => {
        throw new Error(`Ton application ne démarre pas quand NOMBRE_MAX_PRODUITS ne se trouve que dans .env.test : \`envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env'\` dans ConfigModule.forRoot. (${(erreur as Error).message.split('\n')[0]})`);
      });
      try {
        let config: ConfigService;
        try {
          config = lancee.app.get(ConfigService);
        } catch {
          throw new Error('Ton application n\'a pas de ConfigService : `ConfigModule.forRoot({ isGlobal: true, envFilePath: ... })` dans AppModule (parties 4 et 6).');
        }
        const lu = config.get<unknown>('NOMBRE_MAX_PRODUITS');
        expect(Number(lu), 'avec NODE_ENV=test, NOMBRE_MAX_PRODUITS doit venir de .env.test (7), pas de .env (3)').toBe(7);
      } finally {
        await lancee.fermer();
      }
    });

    it('en test, le démarrage supprime les tables (dropSchema) puis les recrée d\'après tes entités (synchronize)', async () => {
      await verifierBaseJoignable();
      await sql('CREATE TABLE IF NOT EXISTS temoin_partie6 (id int)');
      const lancee = await lancer({ env: { NODE_ENV: 'test' } });
      try {
        let ds: DataSource;
        try {
          ds = lancee.app.get(DataSource);
        } catch {
          throw new Error('Ton application n\'a pas de connexion TypeORM : `TypeOrmModule.forRootAsync(...)` dans AppModule (exercice 5.1).');
        }
        const presentes = await tables();
        expect(presentes, '`dropSchema: true` en test : la table témoin, créée avant le démarrage, doit avoir disparu').not.toContain('temoin_partie6');
        const attendues = ds.entityMetadatas.map((m) => m.tableName);
        for (const table of attendues) expect(presentes, `\`synchronize: true\` en test : la table ${table} doit être recréée`).toContain(table);
      } finally {
        await lancee.fermer();
        await sql('DROP TABLE IF EXISTS temoin_partie6');
      }
    });

    it('le garde-fou : en test, une base dont le nom ne finit pas par _test est refusée', async () => {
      const fabrique = await fabriqueTypeOrm();
      if (!fabrique) throw new Error('Aucun `TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory })` dans les imports d\'AppModule (exercice 5.1).');
      const valeurs: Record<string, string> = { DB_HOST: 'localhost', DB_PORT: '5432', DB_USER: 'marketplace', DB_PASSWORD: 'marketplace', DB_NAME: 'marketplace' };
      const faux = { get: (cle: string) => valeurs[cle], getOrThrow: (cle: string) => valeurs[cle] };
      const sauvegarde = { NODE_ENV: process.env.NODE_ENV, DB_NAME: process.env.DB_NAME };
      Object.assign(process.env, { NODE_ENV: 'test', DB_NAME: 'marketplace' });
      let erreur: unknown;
      try {
        await fabrique(faux);
      } catch (e) {
        erreur = e;
      } finally {
        Object.assign(process.env, sauvegarde);
      }
      expect(erreur, 'avec DB_NAME=marketplace et NODE_ENV=test, ta fabrique TypeORM doit lever une erreur AVANT toute connexion : `if (enTest && !base.endsWith(\'_test\')) throw new Error(...)`').toBeInstanceOf(Error);
    });
  });

  describe('tes tests de bout en bout avec la base', () => {
    let copie: Copie | undefined;
    let executions: Record<string, Execution> = {};
    let echec: unknown;
    beforeEach(() => {
      if (echec) throw echec;
    });
    beforeAll(async () => {
      try {
        await verifierBaseJoignable();
        copie = preparerCopie();
        executions = parMutation(await copie.executer('e2e', ['aucune', 'aucune (2e fois)', ...Object.keys(MUTATIONS)]));
      } catch (erreur) {
        echec = erreur;
      }
    }, 600_000);
    afterAll(() => copie?.nettoyer());

    const exigerTestsVerts = () => {
      exigerVert(executions.aucune, 'test/**/*.e2e-spec.ts, avec la base marketplace_test', INDICE_E2E);
      exigerMention(specsE2e(), '/api/vendeurs', 'test/**/*.e2e-spec.ts', INDICE_E2E);
    };

    it('6.13 · ton test crée, relit et renomme un vendeur (le renommage est vérifié)', () => {
      exigerTestsVerts();
      exigerDetection(executions, 'http:patch-sans-effet', MUTATIONS['http:patch-sans-effet']!);
    });

    it('6.13 · ton test supprime le vendeur (204), puis vérifie qu\'un GET répond 404', () => {
      exigerTestsVerts();
      exigerDetection(executions, 'http:delete-sans-effet', MUTATIONS['http:delete-sans-effet']!);
      exigerDetection(executions, 'http:404-masque', MUTATIONS['http:404-masque']!);
    });

    it('6.13 · ton test vérifie le 409 quand le vendeur a un produit commandé', () => {
      exigerTestsVerts();
      exigerDetection(executions, 'http:409-masque', MUTATIONS['http:409-masque']!);
    });

    it('6.14 · un TRUNCATE … RESTART IDENTITY de toutes tes tables avant chaque test', async () => {
      exigerTestsVerts();
      const sans = executions.aucune!;
      const vidages = sans.journal.filter((l) => l.sql !== null);
      if (vidages.length === 0) throw new Error('Aucun TRUNCATE exécuté par tes tests : ajoute `await dataSource.query(\'TRUNCATE TABLE … RESTART IDENTITY\')` dans un beforeEach.');
      const sansRestart = vidages.filter((l) => !tablesVidees(l.sql!).restart);
      expect(sansRestart.map((l) => l.sql), 'ajoute RESTART IDENTITY : les id doivent repartir à 1 à chaque test').toEqual([]);
      // Avant chaque test : autant de tests « précédés d'un TRUNCATE » que de tests dans le fichier.
      const couverts = sans.modules.filter((m) => {
        const testsVides = new Set(vidages.filter((l) => l.fichier === m.fichier && l.test).map((l) => l.test));
        return m.tests.length > 0 && testsVides.size >= m.tests.length;
      });
      expect(couverts.map((m) => m.fichier), 'le TRUNCATE doit s\'exécuter avant CHAQUE test (dans un beforeEach, pas un beforeAll)').not.toHaveLength(0);
      const videes = new Set(vidages.flatMap((l) => tablesVidees(l.sql!).tables));
      const cascade = vidages.some((l) => tablesVidees(l.sql!).cascade);
      const aVider = (await tables()).filter((t) => !['migrations', 'typeorm_metadata', 'query-result-cache'].includes(t));
      if (!cascade) {
        expect(aVider.filter((t) => !videes.has(t)), 'ces tables ne sont jamais vidées : ajoute-les à ton TRUNCATE (tes cinq tables)').toEqual([]);
      }
    });

    it('6.14 · un deuxième fichier e2e utilise la même base', () => {
      exigerTestsVerts();
      const fichiers = [...new Set(executions.aucune!.journal.map((l) => l.fichier))];
      if (fichiers.length < 2) {
        throw new Error(`Un seul fichier de test parle à la base (${fichiers.join(', ') || 'aucun'}) : ajoute un deuxième fichier test/*.e2e-spec.ts qui démarre AppModule et utilise la même base.`);
      }
    });

    it('6.14 · fileParallelism: false dans vitest.config.e2e.ts', async () => {
      const config = await copie!.config('vitest.config.e2e.ts');
      if (!config) throw new Error('Fichier attendu : vitest.config.e2e.ts, à la racine du dépôt.');
      expect(config.fileParallelism, 'ajoute `fileParallelism: false` dans le bloc `test` de vitest.config.e2e.ts').toBe(false);
    });

    it('6.14 · relancés, tes tests donnent le même résultat', () => {
      exigerTestsVerts();
      exigerVert(executions['aucune (2e fois)'], 'test/**/*.e2e-spec.ts, 2e lancement', 'Tes tests doivent donner le même résultat à chaque lancement.');
      expect(testsTombes(executions['aucune (2e fois)']!)).toEqual([]);
    });
  });
});
