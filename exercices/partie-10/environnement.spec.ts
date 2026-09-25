import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { importer } from '../aide.js';
import { parametresBase } from '../partie-5/outils.js';
import { SECRET, SECRET_REFRESH } from '../partie-7/outils.js';
import { chargerExport, rechargerLeCode } from './outils.js';

// 10.1 : la validation de tout l'environnement, appelée directement (une simple fonction) ;
// 10.3 : data-source.ts chargé sans aucun fichier .env. Le démarrage réel (code de sortie, /docs en
// production) est vérifié sur ton application compilée, dans production.spec.ts.
// À faire toi-même : retirer l'import de `reflect-metadata` de ton test et noter le message (10.1).

type Valider = (config: Record<string, unknown>) => Record<string, unknown>;

const INDICE = 'Exporte `validerEnvironnement(config)` de src/config/variables-environnement.ts (exercice 4.13), complétée au 10.1.';

/** Un environnement de production complet (valeurs de chaîne, comme dans process.env). */
const complet = (): Record<string, unknown> => ({
  NODE_ENV: 'production',
  DB_HOST: 'db',
  DB_USER: 'marketplace',
  DB_PASSWORD: 'un-mot-de-passe',
  DB_NAME: 'marketplace',
  NOMBRE_MAX_PRODUITS: '50',
  JWT_SECRET: SECRET,
  JWT_REFRESH_SECRET: SECRET_REFRESH,
  REDIS_HOST: 'redis',
});

/** Le message de l'erreur levée (null si rien n'est levé). */
function erreurDe(valider: Valider, config: Record<string, unknown>): string | null {
  try {
    valider(config);
    return null;
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message : String(erreur);
  }
}

const sans = (config: Record<string, unknown>, cle: string) => Object.fromEntries(Object.entries(config).filter(([k]) => k !== cle));

describe('Partie 10 · L\'environnement (exercices 10.1 et 10.3)', () => {
  let valider: Valider;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      valider = await chargerExport<Valider>('validerEnvironnement', INDICE);
      if (typeof valider !== 'function') throw new Error(`\`validerEnvironnement\` doit être une fonction. ${INDICE}`);
    } catch (erreur) {
      echec = erreur;
    }
  });

  describe('10.1 · valider tout l\'environnement', () => {
    it('accepte un environnement complet, convertit les nombres et complète les valeurs par défaut', () => {
      const probleme = erreurDe(valider, complet());
      expect(probleme, `un environnement complet (NODE_ENV, DB_*, NOMBRE_MAX_PRODUITS, JWT_*, REDIS_HOST) doit être accepté`).toBeNull();
      const config = valider(complet());
      expect(config.NOMBRE_MAX_PRODUITS, '`NOMBRE_MAX_PRODUITS: \'50\'` devient le nombre 50 (`enableImplicitConversion: true`)').toBe(50);
      expect(config.PORT, 'PORT vaut 3000 par défaut').toBe(3000);
      expect(config.DB_PORT, '`DB_PORT: number = 5432` : le port standard de PostgreSQL, par défaut').toBe(5432);
    });

    it('NODE_ENV : development par défaut, et seulement development, production ou test', () => {
      expect(valider(sans(complet(), 'NODE_ENV')).NODE_ENV, '`NODE_ENV: string = \'development\'` : la valeur par défaut').toBe('development');
      for (const valeur of ['development', 'production', 'test']) expect(erreurDe(valider, { ...complet(), NODE_ENV: valeur }), `NODE_ENV=${valeur} doit être accepté`).toBeNull();
      for (const faute of ['prod', 'Production', 'dev']) {
        const message = erreurDe(valider, { ...complet(), NODE_ENV: faute });
        expect(message, `NODE_ENV=${faute} doit être refusé : \`@IsIn(['development', 'production', 'test'])\``).not.toBeNull();
        expect(message, 'le message nomme la variable et la règle violée : `NODE_ENV (isIn)`').toMatch(/NODE_ENV \(isIn\)/);
      }
    });

    it('DB_HOST, DB_USER, DB_PASSWORD et DB_NAME sont obligatoires ; DB_PORT doit être un nombre', () => {
      for (const cle of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
        const absente = erreurDe(valider, sans(complet(), cle));
        expect(absente, `sans ${cle}, la validation doit échouer (\`@IsString()\` et \`@IsNotEmpty()\`)`).not.toBeNull();
        expect(absente, `le message doit nommer ${cle}`).toContain(cle);
        expect(erreurDe(valider, { ...complet(), [cle]: '' }), `${cle} vide doit être refusée (\`@IsNotEmpty()\`)`).toContain(cle);
      }
      expect(erreurDe(valider, { ...complet(), DB_PORT: 'cinq-mille' }), '`DB_PORT: \'cinq-mille\'` doit être refusé (`@IsNumber()`)').toContain('DB_PORT');
      expect(valider({ ...complet(), DB_PORT: '6543' }).DB_PORT, 'DB_PORT converti en nombre').toBe(6543);
    });

    it('les règles des parties 4 et 7 tiennent toujours (NOMBRE_MAX_PRODUITS, JWT_SECRET, JWT_REFRESH_SECRET)', () => {
      expect(erreurDe(valider, sans(complet(), 'NOMBRE_MAX_PRODUITS')), 'NOMBRE_MAX_PRODUITS reste obligatoire (4.13)').toContain('NOMBRE_MAX_PRODUITS');
      expect(erreurDe(valider, { ...complet(), JWT_SECRET: 'court' }), 'un JWT_SECRET de moins de 32 caractères reste refusé (7.5)').toMatch(/JWT_SECRET/);
      expect(erreurDe(valider, sans(complet(), 'JWT_REFRESH_SECRET')), 'garde JWT_REFRESH_SECRET dans la classe (7.15)').toMatch(/JWT_REFRESH_SECRET/);
    });

    it('un message d\'une seule ligne, qui nomme toutes les variables fautives et leur règle', () => {
      const message = erreurDe(valider, { NODE_ENV: 'production' }) ?? '';
      expect(message, 'un environnement vide doit être refusé').not.toBe('');
      expect(message, 'remplace `erreurs.toString()` (qui répète « An instance of … has failed the validation ») par le message d\'une ligne de la section').not.toMatch(/An instance of/);
      expect(message.trim(), 'une seule ligne').not.toContain('\n');
      for (const cle of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'NOMBRE_MAX_PRODUITS', 'JWT_SECRET']) {
        expect(message, `le message doit nommer ${cle}, avec sa règle entre parenthèses : \`${cle} (…)\``).toMatch(new RegExp(`${cle} \\([a-zA-Z, ]+\\)`));
      }
    });
  });

  describe('10.3 · démarrer sans fichier .env', () => {
    it('src/data-source.ts se charge sans .env, et lit alors les variables d\'environnement', async () => {
      const p = parametresBase();
      const variables = { DB_HOST: p.host, DB_PORT: String(p.port), DB_USER: p.user, DB_PASSWORD: p.password, DB_NAME: p.database };
      const sauvegarde = new Map(Object.keys(variables).map((cle) => [cle, process.env[cle]]));
      Object.assign(process.env, variables);
      const dossier = mkdtempSync(join(tmpdir(), 'nestjs-open-p10-ds-'));
      const initial = process.cwd();
      process.chdir(dossier);
      rechargerLeCode();
      try {
        let module: { default?: unknown };
        try {
          module = await importer<{ default?: unknown }>('data-source', 'Crée src/data-source.ts (exercice 5.14).');
        } catch (erreur) {
          const message = (erreur as Error).message;
          if (/ENOENT|\.env/.test(message)) {
            throw new Error(`src/data-source.ts échoue sans fichier .env (${message.split('\n')[0]}) : ne charge le fichier que s'il existe, \`if (existsSync('.env')) process.loadEnvFile();\` (exercice 10.3).`);
          }
          throw erreur;
        }
        expect(module.default instanceof DataSource, '`export default new DataSource({ ... })`').toBe(true);
        const options = (module.default as DataSource).options as { host?: string; database?: string };
        expect(options.host, 'sans .env, DB_HOST vient de l\'environnement (`process.env.DB_HOST`)').toBe(p.host);
        expect(options.database, 'sans .env, DB_NAME vient de l\'environnement').toBe(p.database);
      } finally {
        process.chdir(initial);
        rmSync(dossier, { recursive: true, force: true });
        for (const [cle, valeur] of sauvegarde) {
          if (valeur === undefined) delete process.env[cle];
          else process.env[cle] = valeur;
        }
      }
    });
  });
});
