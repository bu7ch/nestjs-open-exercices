import { importer, meta } from '../aide.js';
import { detail } from '../partie-4/outils.js';
import { compter, creerVendeur, entite, lancerAvecBase, parametresBase, sql, tables, type AppAvecBase } from './outils.js';

type Classe = new (...args: never[]) => unknown;

const INDICE_VENDEUR = 'Crée l\'entité `Vendeur` (`@Entity(\'vendeurs\')`) et déclare-la avec `TypeOrmModule.forFeature([Vendeur])` dans son module (exercice 5.3).';

describe('Partie 5 · PostgreSQL, TypeORM et le repository des vendeurs (exercices 5.1, 5.3 à 5.7)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];

  // Si l'application ne démarre pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      lancee = await lancerAvecBase();
      http = lancee.http;
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  describe('5.1 · la connexion à PostgreSQL', () => {
    it('AppModule importe TypeOrmModule', async () => {
      const { AppModule } = await importer<Record<string, Classe>>('app.module', '');
      const imports = await Promise.all(meta('imports', AppModule!));
      const aTypeOrm = imports.some((i) => (i as { module?: { name?: string } })?.module?.name === 'TypeOrmModule');
      expect(aTypeOrm, 'ajoute `TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: ... })` aux imports d\'AppModule').toBe(true);
    });

    it('l\'application est connectée à la base donnée par les variables DB_*', () => {
      const p = parametresBase();
      const options = lancee.ds.options as { type: string; host?: string; port?: unknown; username?: string; database?: string };
      expect(lancee.ds.isInitialized).toBe(true);
      expect(options.type).toBe('postgres');
      expect(options.database, 'lis DB_NAME avec `config.get(\'DB_NAME\')`').toBe(p.database);
      expect(options.host, 'lis DB_HOST avec `config.get(\'DB_HOST\')`').toBe(p.host);
      expect(Number(options.port), 'lis DB_PORT avec `config.get(\'DB_PORT\')`').toBe(p.port);
      expect(options.username, 'lis DB_USER avec `config.get(\'DB_USER\')`').toBe(p.user);
    });
  });

  describe('5.3 · l\'entité Vendeur et GET /api/vendeurs', () => {
    it('l\'entité Vendeur décrit la table `vendeurs` (id généré par la base, nom)', async () => {
      const vendeur = entite(lancee.ds, 'Vendeur', INDICE_VENDEUR);
      expect(vendeur.tableName, '`@Entity(\'vendeurs\')`').toBe('vendeurs');
      expect(vendeur.primaryColumns.map((c) => c.propertyName)).toEqual(['id']);
      expect(vendeur.primaryColumns[0]!.isGenerated, '`@PrimaryGeneratedColumn()` sur id').toBe(true);
      expect(vendeur.findColumnWithPropertyName('nom'), '`@Column() nom: string`').toBeDefined();
      expect(await tables()).toContain('vendeurs');
    });

    it('GET /api/vendeurs renvoie les vendeurs de la base (lus avec le repository)', async () => {
      await sql('INSERT INTO vendeurs (nom) VALUES ($1)', ['Écrit directement en SQL']);
      const r = await http().get('/api/vendeurs');
      expect(r.status, 'ajoute `GET /api/vendeurs`, qui renvoie `this.vendeurs.find()`').toBe(200);
      expect(Array.isArray(r.body)).toBe(true);
      expect(r.body.map((v: { nom: string }) => v.nom), 'la liste doit venir de la table vendeurs, pas d\'un tableau en mémoire').toContain('Écrit directement en SQL');
    });
  });

  describe('5.4 · POST /api/vendeurs', () => {
    it('crée un vendeur (201), renvoyé avec son id, et l\'écrit en base', async () => {
      const r = await http().post('/api/vendeurs').send({ nom: 'Atelier du Bois' });
      expect(r.status, 'ajoute `POST /api/vendeurs` (create, puis save)').toBe(201);
      expect(r.body).toMatchObject({ nom: 'Atelier du Bois' });
      expect(typeof r.body.id, '`save` te rend le vendeur avec son id').toBe('number');
      expect(await compter('vendeurs', 'id = $1 AND nom = $2', [r.body.id, 'Atelier du Bois']), 'le vendeur doit être dans la table vendeurs').toBe(1);
    });

    it('refuse un nom vide ou absent (400), avec un message qui nomme `nom`', async () => {
      const vide = await http().post('/api/vendeurs').send({ nom: '' });
      expect(vide.status, 'un DTO validé : `@IsString() @IsNotEmpty()` sur nom').toBe(400);
      expect(detail(vide.body)).toContain('nom');
      const absent = await http().post('/api/vendeurs').send({});
      expect(absent.status).toBe(400);
    });

    it('le vendeur créé est toujours là après un redémarrage du serveur', async () => {
      const cree = await creerVendeur(http, 'Vendeur persistant');
      await lancee.fermer();
      lancee = await lancerAvecBase({ base: 'garder' });
      http = lancee.http;
      const r = await http().get('/api/vendeurs').expect(200);
      expect(r.body.map((v: { id: number }) => v.id)).toContain(cree.id);
    });
  });

  describe('5.5 · GET /api/vendeurs/:id', () => {
    it('renvoie le vendeur demandé', async () => {
      const cree = await creerVendeur(http, 'Le Comptoir');
      const r = await http().get(`/api/vendeurs/${cree.id}`);
      expect(r.status, 'ajoute `GET /api/vendeurs/:id` (findOneBy)').toBe(200);
      expect(r.body).toMatchObject({ id: cree.id, nom: 'Le Comptoir' });
    });

    it('répond 404 pour un id inconnu', async () => {
      const r = await http().get('/api/vendeurs/999999');
      expect(r.status, '`findOneBy` renvoie null : lève une NotFoundException').toBe(404);
    });

    it('répond 400 pour un id qui n\'est pas un nombre', async () => {
      const r = await http().get('/api/vendeurs/abc');
      expect(r.status, '`@Param(\'id\', ParseIntPipe)`').toBe(400);
    });
  });

  describe('5.6 · PATCH /api/vendeurs/:id', () => {
    it('renomme le vendeur, en base', async () => {
      const cree = await creerVendeur(http, 'Ancien nom');
      const r = await http().patch(`/api/vendeurs/${cree.id}`).send({ nom: 'Nouveau nom' });
      expect(r.status, 'ajoute `PATCH /api/vendeurs/:id` : retrouve le vendeur, change `nom`, puis `save`').toBe(200);
      const [ligne] = await sql<{ nom: string }>('SELECT nom FROM vendeurs WHERE id = $1', [cree.id]);
      expect(ligne?.nom).toBe('Nouveau nom');
      expect(await compter('vendeurs', 'nom = $1', ['Nouveau nom']), '`save` sur un vendeur qui a un id met à jour la ligne, il n\'en crée pas une autre').toBe(1);
      const lu = await http().get(`/api/vendeurs/${cree.id}`).expect(200);
      expect(lu.body.nom).toBe('Nouveau nom');
    });

    it('répond 404 pour un id inconnu', async () => {
      const r = await http().patch('/api/vendeurs/999999').send({ nom: 'Personne' });
      expect(r.status).toBe(404);
    });
  });

  describe('5.7 · DELETE /api/vendeurs/:id', () => {
    it('supprime le vendeur (204), puis un deuxième DELETE répond 404', async () => {
      const cree = await creerVendeur(http, 'À supprimer');
      const r = await http().delete(`/api/vendeurs/${cree.id}`);
      expect(r.status, 'ajoute `DELETE /api/vendeurs/:id` avec `@HttpCode(204)`').toBe(204);
      expect(await compter('vendeurs', 'id = $1', [cree.id]), 'le vendeur doit avoir disparu de la table').toBe(0);
      const encore = await http().delete(`/api/vendeurs/${cree.id}`);
      expect(encore.status, '`affected === 0` : lève une NotFoundException').toBe(404);
      await http().get(`/api/vendeurs/${cree.id}`).expect(404);
    });
  });
});
