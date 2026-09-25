import { DataSource, type EntityMetadata, type QueryRunner } from 'typeorm';
import {
  chargerDataSource,
  chargerMigrations,
  colonnes,
  compter,
  connexionMigrations,
  differenceAvecEntites,
  lancerAvecBase,
  parametresBase,
  sql,
  tables,
  type Migration,
} from './outils.js';

// Les migrations sont exécutées ici depuis tes fichiers src/migrations/*.ts (sur la base de test,
// vidée d'abord), comme le ferait `npm run migration:run` avec les fichiers compilés de dist/.

const CINQ_TABLES = ['vendeurs', 'produits', 'variantes', 'commandes', 'lignes_commande'];

describe('Partie 5 · Les migrations (exercices 5.14 à 5.16)', () => {
  let entites: EntityMetadata['target'][];
  let synchronize: unknown;
  let colonneActif: { type: string; defaut: unknown } | undefined;
  let migrations: Migration[];
  let ds: DataSource | undefined;

  // Si l'application ne démarre pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      // On démarre ton application une fois, pour connaître tes entités et ta configuration.
      const lancee = await lancerAvecBase();
      try {
        entites = lancee.ds.entityMetadatas.map((m) => m.target);
        synchronize = lancee.ds.options.synchronize;
        const actif = lancee.ds.entityMetadatas.find((m) => m.name === 'Produit')?.findColumnWithPropertyName('actif');
        colonneActif = actif && { type: lancee.ds.driver.normalizeType(actif), defaut: actif.default };
      } finally {
        await lancee.fermer();
      }
      migrations = await chargerMigrations();
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => ds?.destroy());

  /** Une connexion neuve, sur une base vidée de toutes ses tables. */
  async function baseVide(): Promise<DataSource> {
    await ds?.destroy();
    ds = await connexionMigrations(entites, migrations);
    await ds.dropDatabase();
    return ds;
  }

  const exigerDesMigrations = () =>
    expect(migrations.length, 'aucune migration dans src/migrations/ : génère-la avec `npm run migration:generate -- src/migrations/CreerTables` (exercice 5.14)').toBeGreaterThan(0);

  describe('5.14 · passer aux migrations', () => {
    it('AppModule a désactivé `synchronize`', () => {
      expect(synchronize, 'mets `synchronize: false` dans TypeOrmModule.forRootAsync : ce sont les migrations qui créent le schéma').toBeFalsy();
    });

    it('src/data-source.ts exporte par défaut une DataSource PostgreSQL, qui lit le .env et connaît les migrations', async () => {
      const source = await chargerDataSource();
      expect(source instanceof DataSource, '`export default new DataSource({ ... })`').toBe(true);
      const options = (source as DataSource).options as { type: string; database?: string; migrations?: unknown[]; synchronize?: boolean };
      expect(options.type).toBe('postgres');
      expect(options.database, 'lis DB_NAME dans le .env : `process.loadEnvFile()`, puis `process.env.DB_NAME`').toBe(parametresBase().database);
      expect(options.migrations?.length ?? 0, '`migrations: [\'dist/migrations/*.js\']`').toBeGreaterThan(0);
      expect(options.synchronize ?? false).toBe(false);
    });

    it('sur une base vide, tes migrations créent les cinq tables', async () => {
      exigerDesMigrations();
      const connexion = await baseVide();
      await connexion.runMigrations({ transaction: 'each' });
      const presentes = await tables();
      for (const table of CINQ_TABLES) expect(presentes, `la table \`${table}\` doit être créée par une migration`).toContain(table);
    });

    it('après tes migrations, la base correspond exactement à tes entités (migration:generate ne trouverait rien)', async () => {
      exigerDesMigrations();
      const connexion = await baseVide();
      await connexion.runMigrations({ transaction: 'each' });
      const manque = await differenceAvecEntites(connexion);
      expect(manque, `tes migrations ne décrivent pas tout le schéma de tes entités ; il manquerait :\n${manque.join('\n')}\n→ génère une nouvelle migration avec \`npm run migration:generate\``).toEqual([]);
    });

    it('le serveur (synchronize: false) fonctionne sur la base créée par les migrations', async () => {
      exigerDesMigrations();
      const connexion = await baseVide();
      await connexion.runMigrations({ transaction: 'each' });
      await connexion.destroy();
      ds = undefined;
      const lancee = await lancerAvecBase({ base: 'garder' });
      try {
        const r = await lancee.http().post('/api/vendeurs').send({ nom: 'Vendeur migré' });
        expect(r.status).toBe(201);
        await lancee.http().get(`/api/vendeurs/${r.body.id}`).expect(200);
      } finally {
        await lancee.fermer();
      }
    });
  });

  describe('5.15 et 5.16 · la colonne `actif`, ajoutée puis annulée', () => {
    it('5.15 · Produit a une colonne `actif` (booléen, `default: true`)', () => {
      expect(colonneActif, '`@Column({ default: true }) actif: boolean` sur Produit').toBeDefined();
      expect(colonneActif!.type).toBe('boolean');
      expect(colonneActif!.defaut).toBe(true);
    });

    // On rejoue tes migrations une par une, en s'arrêtant juste avant celle qui ajoute `actif`.
    let qr: QueryRunner;
    let migrationActif: Migration | undefined;
    const idsAvant: number[] = [];

    it('5.15 · une migration à part ajoute `actif`, et les produits déjà là deviennent tous actifs', async () => {
      exigerDesMigrations();
      // Quelle migration ajoute la colonne ? On les applique une à une sur une base vide.
      let connexion = await baseVide();
      qr = connexion.createQueryRunner();
      for (const m of migrations) {
        await m.instance.up(qr);
        if ((await colonnes('produits')).includes('actif')) {
          migrationActif = m;
          break;
        }
      }
      await qr.release();
      expect(migrationActif, 'aucune de tes migrations n\'ajoute la colonne `actif` à la table produits').toBeDefined();
      expect(migrationActif, 'la colonne `actif` doit arriver par une nouvelle migration, pas dans CreerTables : une migration déjà appliquée ne se modifie jamais').not.toBe(migrations[0]);

      // On recommence, en s'arrêtant juste avant, et on crée des produits.
      connexion = await baseVide();
      qr = connexion.createQueryRunner();
      for (const m of migrations) {
        if (m === migrationActif) break;
        await m.instance.up(qr);
      }
      for (const nom of ['Créé avant actif', 'Lui aussi']) {
        const [ligne] = await sql<{ id: number }>('INSERT INTO produits (nom, prix, categorie) VALUES ($1, 10, $2) RETURNING id', [nom, 'papeterie']);
        idsAvant.push(ligne!.id);
      }
      await migrationActif!.instance.up(qr);
      const lignes = await sql<{ actif: boolean }>('SELECT actif FROM produits WHERE id = ANY($1)', [idsAvant]);
      expect(lignes.map((l) => l.actif), 'grâce au `default: true`, les produits existants reçoivent actif = true').toEqual([true, true]);
    });

    it('5.16 · annuler la migration (`down`) retire la colonne sans toucher aux produits, et la rejouer la remet', async () => {
      expect(migrationActif, 'termine d\'abord le 5.15').toBeDefined();
      await migrationActif!.instance.down(qr);
      expect(await colonnes('produits'), 'le `down` de ta migration doit supprimer la colonne actif').not.toContain('actif');
      expect(await compter('produits', 'id = ANY($1)', [idsAvant]), 'les produits doivent rester').toBe(2);
      await migrationActif!.instance.up(qr);
      const lignes = await sql<{ actif: boolean }>('SELECT actif FROM produits WHERE id = ANY($1)', [idsAvant]);
      expect(lignes.map((l) => l.actif)).toEqual([true, true]);
      await qr.release();
    });
  });
});
