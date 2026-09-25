import { categoriesAutorisees, detail, produitValide } from '../partie-4/outils.js';
import { compter, entite, lancerAvecBase, sql, type AppAvecBase } from './outils.js';

const INDICE_PRODUIT = 'Crée l\'entité `Produit` (id, nom, prix, categorie) et déclare-la avec `TypeOrmModule.forFeature([Produit])` dans ProduitsModule (exercice 5.8).';

describe('Partie 5 · Les produits quittent la mémoire (exercice 5.8)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];
  let table: string;

  // Si l'application ne démarre pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      lancee = await lancerAvecBase();
      http = lancee.http;
      table = entite(lancee.ds, 'Produit', INDICE_PRODUIT).tableName;
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  /** Crée un produit par POST /api/produits et renvoie son id. */
  const creer = async (extra: Record<string, unknown> = {}): Promise<number> => {
    const r = await http().post('/api/produits').send(await produitValide(http, extra));
    expect(r.status, `POST /api/produits a répondu ${r.status} : ${JSON.stringify(r.body)}`).toBe(201);
    return r.body.id;
  };

  it('5.8 · l\'entité Produit a les colonnes nom, prix (numeric) et categorie', () => {
    const produit = entite(lancee.ds, 'Produit', INDICE_PRODUIT);
    for (const nom of ['id', 'nom', 'prix', 'categorie']) {
      expect(produit.findColumnWithPropertyName(nom), `colonne \`${nom}\` sur Produit`).toBeDefined();
    }
    expect(produit.findColumnWithPropertyName('prix')!.type, '`@Column({ type: \'numeric\', precision: 10, scale: 2 })` sur prix').toBe('numeric');
  });

  it('5.8 · POST /api/produits écrit le produit en base (201, avec son id)', async () => {
    const r = await http().post('/api/produits').send(await produitValide(http, { nom: 'Lampe en base' }));
    expect(r.status).toBe(201);
    expect(typeof r.body.id, '`save` te rend le produit avec son id').toBe('number');
    expect(await compter(table, 'id = $1 AND nom = $2', [r.body.id, 'Lampe en base']), `le produit doit être dans la table ${table}`).toBe(1);
  });

  it('5.8 · GET /api/produits lit la base (repository), pas un tableau en mémoire', async () => {
    const [categorie] = await categoriesAutorisees(http);
    const [{ id }] = (await sql<{ id: number }>(`INSERT INTO "${table}" (nom, prix, categorie) VALUES ($1, $2, $3) RETURNING id`, ['Écrit en SQL', 12.5, categorie])) as [{ id: number }];
    const liste = await http().get('/api/produits').query({ limite: 1000 }).expect(200);
    expect(liste.body.map((p: { id: number }) => p.id), 'un produit inséré directement dans la table doit apparaître dans la liste').toContain(id);
    const un = await http().get(`/api/produits/${id}`).expect(200);
    expect(un.body).toMatchObject({ id, nom: 'Écrit en SQL', categorie });
  });

  it('5.8 · prix revient sous forme de chaîne (un `numeric` PostgreSQL)', async () => {
    const id = await creer({ nom: 'Produit à 30', prix: 30 });
    const r = await http().get(`/api/produits/${id}`).expect(200);
    expect(typeof r.body.prix, 'PostgreSQL renvoie un `numeric` en chaîne ("30.00") : c\'est normal, ne le convertis pas').toBe('string');
    expect(Number(r.body.prix)).toBe(30);
  });

  describe('5.8 · les routes des parties 3 et 4 fonctionnent toujours', () => {
    it('GET /api/produits/:id : 404 pour un id inconnu, 400 pour un id qui n\'est pas un nombre', async () => {
      await http().get('/api/produits/999999').expect(404);
      await http().get('/api/produits/abc').expect(400);
    });

    it('?limite= : 10 produits par défaut, `take` sinon', async () => {
      while ((await compter(table)) < 12) await creer({ nom: 'Produit en série' });
      const defaut = await http().get('/api/produits').expect(200);
      expect(defaut.body, 'sans ?limite=, 10 produits au plus (DefaultValuePipe(10), puis `take`)').toHaveLength(10);
      const trois = await http().get('/api/produits').query({ limite: 3 }).expect(200);
      expect(trois.body).toHaveLength(3);
      await http().get('/api/produits').query({ limite: 'beaucoup' }).expect(400);
    });

    it('?categorie= ne renvoie que les produits de cette catégorie', async () => {
      const categories = await categoriesAutorisees(http);
      const categorie = categories[categories.length - 1]!;
      const id = await creer({ nom: 'Filtré par catégorie', categorie });
      const r = await http().get('/api/produits').query({ categorie, limite: 1000 }).expect(200);
      expect(r.body.every((p: { categorie: string }) => p.categorie === categorie), 'filtre avec `where: { categorie }`').toBe(true);
      expect(r.body.map((p: { id: number }) => p.id)).toContain(id);
    });

    it('GET /api/produits/categorie/:categorie filtre en base, et refuse une catégorie inconnue (400)', async () => {
      const [categorie] = await categoriesAutorisees(http);
      const id = await creer({ nom: 'Par la route catégorie', categorie });
      const r = await http().get(`/api/produits/categorie/${encodeURIComponent(categorie!)}`).expect(200);
      expect(r.body.every((p: { categorie: string }) => p.categorie === categorie)).toBe(true);
      expect(r.body.map((p: { id: number }) => p.id)).toContain(id);
      await http().get('/api/produits/categorie/categorie-qui-nexiste-pas').expect(400);
    });

    it('GET /api/categories renvoie les catégories des produits en base, sans doublon', async () => {
      const categories = await categoriesAutorisees(http);
      for (const categorie of categories) {
        await creer({ nom: 'Pour les catégories', categorie });
        await creer({ nom: 'Pour les catégories (bis)', categorie });
      }
      const attendues = (await sql<{ categorie: string }>(`SELECT DISTINCT categorie FROM "${table}"`)).map((c) => c.categorie).sort();
      const r = await http().get('/api/categories').expect(200);
      expect([...r.body].sort(), '`find` avec `select: { categorie: true }`, puis un Set').toEqual(attendues);
    });

    it('la création est toujours validée (400 pour un prix négatif)', async () => {
      const r = await http().post('/api/produits').send(await produitValide(http, { prix: -5 }));
      expect(r.status).toBe(400);
      expect(detail(r.body)).toContain('prix');
    });

    it('NOMBRE_MAX_PRODUITS limite toujours la création (compté en base avec `count()`)', async () => {
      const depart = await compter(table);
      await lancee.fermer();
      lancee = await lancerAvecBase({ base: 'garder', env: { NOMBRE_MAX_PRODUITS: String(depart + 1) } });
      http = lancee.http;
      await http().post('/api/produits').send(await produitValide(http, { nom: 'Le dernier autorisé' })).expect(201);
      const r = await http().post('/api/produits').send(await produitValide(http, { nom: 'Un de trop' }));
      expect(r.status, `avec NOMBRE_MAX_PRODUITS=${depart + 1} et ${depart + 1} produits dans la table, la création doit être refusée (400)`).toBe(400);
      expect(await compter(table)).toBe(depart + 1);
    });
  });
});
