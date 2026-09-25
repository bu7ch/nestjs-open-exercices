import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { DataSource, type EntityMetadata, type MigrationInterface } from 'typeorm';
import { importer, lancer, rechargerLeCode, type AppLancee, type OptionsLancement } from '../aide.js';

// Les outils de la partie 5 : parler à la base de test, et démarrer ton application dessus.
// La base est choisie par les variables DB_* que fournit vitest.config.ts (jamais ton .env).

export const INDICE_COMPOSE = 'Lance la base avec `docker compose up -d` à la racine du dépôt (voir le README, section « Base de données »).';

/** Les paramètres de connexion des tests (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME). */
export function parametresBase() {
  const e = process.env;
  return { host: e.DB_HOST ?? 'localhost', port: Number(e.DB_PORT ?? 5432), user: e.DB_USER ?? 'marketplace', password: e.DB_PASSWORD ?? 'marketplace', database: e.DB_NAME ?? 'marketplace_test' };
}

/** Les tests suppriment des tables : ils refusent toute base dont le nom ne finit pas par `_test`. */
export function verifierBaseDeTest(nom: unknown, qui = 'DB_NAME') {
  if (typeof nom !== 'string' || !nom.endsWith('_test')) {
    throw new Error(`Base « ${String(nom)} » refusée (${qui}) : les tests ne touchent qu'à une base dont le nom finit par _test, car ils en effacent les tables.`);
  }
}

let joignable: Promise<void> | undefined;

/** Vérifie une fois que PostgreSQL répond, avec un message qui dit quoi faire sinon. */
export function verifierBaseJoignable(): Promise<void> {
  joignable ??= (async () => {
    const p = parametresBase();
    verifierBaseDeTest(p.database);
    const client = new pg.Client({ ...p, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
    } catch (erreur) {
      const { code, message } = erreur as { code?: string; message: string };
      if (code === '3D000') {
        throw new Error(`La base « ${p.database} » n'existe pas dans ton PostgreSQL (${p.host}:${p.port}). Crée-la : docker compose exec db psql -U ${p.user} -d marketplace -c 'CREATE DATABASE ${p.database};'`);
      }
      throw new Error(`PostgreSQL injoignable (${p.host}:${p.port}, base ${p.database}, utilisateur ${p.user}) : ${message || code}. ${INDICE_COMPOSE}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  })();
  return joignable;
}

/** Exécute une requête SQL directement sur la base de test (sans passer par ton application). */
export async function sql<T = Record<string, unknown>>(requete: string, parametres: unknown[] = []): Promise<T[]> {
  await verifierBaseJoignable();
  const client = new pg.Client(parametresBase());
  await client.connect();
  try {
    return (await client.query(requete, parametres)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Le nombre de lignes d'une table. */
export const compter = async (table: string, condition = 'TRUE', parametres: unknown[] = []): Promise<number> =>
  Number((await sql<{ n: string }>(`SELECT count(*) AS n FROM "${table}" WHERE ${condition}`, parametres))[0]!.n);

export const tables = async (): Promise<string[]> =>
  (await sql<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).map((t) => t.table_name);

export const colonnes = async (table: string): Promise<string[]> =>
  (await sql<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])).map((c) => c.column_name);

export interface AppAvecBase extends AppLancee {
  /** La connexion TypeORM de ton application. */
  ds: DataSource;
}

export interface OptionsBase extends OptionsLancement {
  /**
   * `vierge` (par défaut) : les tables sont supprimées puis recréées d'après tes entités, vides.
   * `garder` : on garde les données du lancement précédent (pour vérifier qu'elles survivent).
   */
  base?: 'vierge' | 'garder';
}

async function avecDelai<T>(promesse: Promise<T>, ms: number, message: string): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  const delai = new Promise<never>((_, rejeter) => (minuteur = setTimeout(() => rejeter(new Error(message)), ms)));
  try {
    return await Promise.race([promesse, delai]);
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Démarre ton application (via ton main.ts, comme `lancer`) sur la base de test. Par défaut, le
 * schéma repart à neuf : tables supprimées, puis recréées d'après tes entités (même si ton
 * application a `synchronize: false` : les migrations sont testées à part, en 5.14).
 */
export async function lancerAvecBase(options: OptionsBase = {}): Promise<AppAvecBase> {
  verifierBaseDeTest(process.env.DB_NAME);
  await verifierBaseJoignable();
  const demarrage = lancer(options);
  const lancee = await avecDelai(
    demarrage,
    15000,
    `Ton application ne démarre pas (connexion à PostgreSQL ?) : vérifie que TypeOrmModule.forRootAsync lit DB_HOST, DB_PORT, DB_USER, DB_PASSWORD et DB_NAME avec ConfigService (exercice 5.1).`,
  ).catch((erreur: unknown) => {
    // Si elle finit par démarrer après le délai, on l'arrête.
    demarrage.then((l) => l.fermer()).catch(() => undefined);
    throw erreur;
  });
  let ds: DataSource;
  try {
    ds = lancee.app.get(DataSource);
  } catch {
    await lancee.fermer();
    throw new Error('Ton application n\'a pas de connexion TypeORM : branche `TypeOrmModule.forRootAsync(...)` dans les imports d\'AppModule (exercice 5.1).');
  }
  try {
    verifierBaseDeTest(ds.options.database, 'la base à laquelle ton TypeOrmModule se connecte : lis DB_NAME avec ConfigService');
    if ((options.base ?? 'vierge') === 'vierge') {
      await ds.dropDatabase();
      await ds.synchronize();
    }
  } catch (erreur) {
    await lancee.fermer();
    throw erreur;
  }
  return { ...lancee, ds };
}

/** Les métadonnées TypeORM d'une entité, par le nom de sa classe (message clair si elle manque). */
export function entite(ds: DataSource, nom: string, indice: string): EntityMetadata {
  const meta = ds.entityMetadatas.find((m) => m.name === nom);
  if (!meta) {
    const connues = ds.entityMetadatas.map((m) => m.name).join(', ') || 'aucune';
    throw new Error(`Aucune entité \`${nom}\` enregistrée dans ta connexion TypeORM (entités connues : ${connues}). ${indice}`);
  }
  return meta;
}

/** La relation de `meta` vers l'entité `cible` (par exemple Produit → Vendeur). */
export function relationVers(meta: EntityMetadata, cible: string, type: 'many-to-one' | 'one-to-many') {
  return meta.relations.find((r) => r.relationType === type && r.inverseEntityMetadata.name === cible);
}

// --- Des données, créées par tes routes ---------------------------------------------------------

type Http = AppLancee['http'];

export async function creerVendeur(http: Http, nom = 'Atelier du Bois'): Promise<{ id: number; nom: string }> {
  const r = await http().post('/api/vendeurs').send({ nom });
  if (r.status !== 201) throw new Error(`POST /api/vendeurs a répondu ${r.status} au lieu de 201 (exercice 5.4) : ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function creerProduitDuVendeur(http: Http, vendeurId: number, produit: Record<string, unknown>): Promise<{ id: number }> {
  const r = await http().post(`/api/vendeurs/${vendeurId}/produits`).send(produit);
  if (r.status !== 201) throw new Error(`POST /api/vendeurs/${vendeurId}/produits a répondu ${r.status} au lieu de 201 (exercice 5.9) : ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function creerVariante(http: Http, produitId: number, nom = 'Rouge'): Promise<{ id: number }> {
  const r = await http().post(`/api/produits/${produitId}/variantes`).send({ nom });
  if (r.status !== 201) throw new Error(`POST /api/produits/${produitId}/variantes a répondu ${r.status} au lieu de 201 (exercice 5.11) : ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function creerCommande(http: Http, lignes: { varianteId: number; quantite: number }[]): Promise<{ id: number }> {
  const r = await http().post('/api/commandes').send({ lignes });
  if (r.status !== 201) throw new Error(`POST /api/commandes a répondu ${r.status} au lieu de 201 (exercice 5.12) : ${JSON.stringify(r.body)}`);
  return r.body;
}

// --- Les migrations (5.14 à 5.16) ----------------------------------------------------------------

const fichiersMigrations = import.meta.glob('../../src/migrations/*.ts');

export interface Migration {
  nom: string;
  timestamp: number;
  instance: MigrationInterface;
  classe: new () => MigrationInterface;
}

/** Tes migrations (src/migrations/*.ts), dans l'ordre de leur horodatage. */
export async function chargerMigrations(): Promise<Migration[]> {
  const migrations: Migration[] = [];
  for (const [chemin, charger] of Object.entries(fichiersMigrations)) {
    const contenu = (await charger()) as Record<string, unknown>;
    for (const valeur of Object.values(contenu)) {
      if (typeof valeur !== 'function' || typeof (valeur.prototype as { up?: unknown })?.up !== 'function') continue;
      const classe = valeur as new () => MigrationInterface;
      const instance = new classe();
      const nom = instance.name ?? classe.name;
      const timestamp = Number(nom.slice(-13));
      if (!Number.isFinite(timestamp)) throw new Error(`${chemin.replace('../../', '')} : le nom de la classe doit finir par un horodatage (fichier généré par migration:generate).`);
      migrations.push({ nom, timestamp, instance, classe });
    }
  }
  return migrations.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Une connexion à la base de test, hors de ton application, avec tes entités et tes migrations
 * (l'équivalent de ton data-source.ts, mais sur les fichiers .ts plutôt que sur dist/).
 */
export async function connexionMigrations(entites: EntityMetadata['target'][], migrations: Migration[]): Promise<DataSource> {
  const p = parametresBase();
  verifierBaseDeTest(p.database);
  await verifierBaseJoignable();
  const ds = new DataSource({
    type: 'postgres',
    host: p.host,
    port: p.port,
    username: p.user,
    password: p.password,
    database: p.database,
    entities: entites as never,
    migrations: migrations.map((m) => m.classe),
    logging: false,
  });
  await ds.initialize();
  return ds;
}

/** Les requêtes qu'il faudrait encore exécuter pour que la base corresponde à tes entités. */
export async function differenceAvecEntites(ds: DataSource): Promise<string[]> {
  const { upQueries } = await ds.driver.createSchemaBuilder().log();
  return upQueries.map((q) => q.query);
}

// --- Le script de données de test (5.17, 5.18) ----------------------------------------------------

/**
 * Exécute ton src/seed.ts, comme `node dist/seed.js`, sur la base de test (dans un dossier
 * temporaire : ton .env n'est pas lu). Rejette si le script lève une erreur.
 */
export async function executerSeed(env: Record<string, string | undefined> = {}): Promise<void> {
  verifierBaseDeTest(process.env.DB_NAME);
  const sauvegarde = new Map(Object.keys(env).map((cle) => [cle, process.env[cle]]));
  for (const [cle, valeur] of Object.entries(env)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  const dossier = mkdtempSync(join(tmpdir(), 'nestjs-open-seed-'));
  const dossierInitial = process.cwd();
  process.chdir(dossier);
  rechargerLeCode();
  try {
    await avecDelai(importer('seed', 'Écris le script de données de test src/seed.ts (exercice 5.17).'), 15000, 'src/seed.ts ne se termine pas : n\'oublie pas `await app.close()` à la fin.');
  } finally {
    process.chdir(dossierInitial);
    rmSync(dossier, { recursive: true, force: true });
    for (const [cle, valeur] of sauvegarde) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  }
}

/** Charge ton src/data-source.ts dans un dossier temporaire dont le .env vise la base de test. */
export async function chargerDataSource(): Promise<unknown> {
  const p = parametresBase();
  const dossier = mkdtempSync(join(tmpdir(), 'nestjs-open-ds-'));
  writeFileSync(join(dossier, '.env'), `DB_HOST=${p.host}\nDB_PORT=${p.port}\nDB_USER=${p.user}\nDB_PASSWORD=${p.password}\nDB_NAME=${p.database}\n`);
  const dossierInitial = process.cwd();
  process.chdir(dossier);
  rechargerLeCode();
  try {
    const module = await importer<{ default?: unknown }>('data-source', 'Crée src/data-source.ts, qui exporte par défaut ta DataSource (exercice 5.14).');
    return module.default;
  } finally {
    process.chdir(dossierInitial);
    rmSync(dossier, { recursive: true, force: true });
  }
}
