import { lancer, type AppLancee } from '../aide.js';
import { categoriesAutorisees, nombreDeProduits, produitValide } from './outils.js';

describe('Partie 4 · Les pipes (exercices 4.8 à 4.10)', () => {
  let lancee: AppLancee;
  let http: AppLancee['http'];

  beforeAll(async () => {
    lancee = await lancer();
    http = lancee.http;
  });
  afterAll(() => lancee?.fermer());

  describe('4.8 · ParseIntPipe sur GET /api/produits/:id', () => {
    it('un id numérique fonctionne toujours', async () => {
      const { body } = await http().get('/api/produits').expect(200);
      expect(body[0], "il faut au moins un produit dans ta liste (exercice 3.4)").toBeDefined();
      const r = await http().get(`/api/produits/${body[0].id}`).expect(200);
      expect(r.body).toEqual(body[0]);
    });

    it('un id qui n\'est pas un nombre donne un 400', async () => {
      const r = await http().get('/api/produits/abc');
      expect(r.status, 'applique `ParseIntPipe` : `@Param(\'id\', ParseIntPipe) id: number`').toBe(400);
    });

    it('un id numérique inconnu donne toujours un 404', async () => {
      await http().get('/api/produits/999999').expect(404);
    });
  });

  describe('4.9 · CategorieValidePipe et GET /api/produits/categorie/:categorie', () => {
    it('renvoie les produits de la catégorie demandée', async () => {
      const [categorie] = await categoriesAutorisees(http);
      const cree = (await http().post('/api/produits').send(await produitValide(http, { categorie, nom: 'Produit du 4.9' })).expect(201)).body;
      const r = await http().get(`/api/produits/categorie/${encodeURIComponent(categorie!)}`);
      expect(r.status, 'ajoute la route `GET /api/produits/categorie/:categorie`').toBe(200);
      expect(Array.isArray(r.body)).toBe(true);
      expect(r.body.every((p: { categorie: string }) => p.categorie === categorie), 'uniquement des produits de cette catégorie').toBe(true);
      expect(r.body.map((p: { id: number }) => p.id)).toContain(cree.id);
    });

    it('accepte chaque catégorie de la liste de ton DTO', async () => {
      for (const categorie of await categoriesAutorisees(http)) {
        const r = await http().get(`/api/produits/categorie/${encodeURIComponent(categorie)}`);
        expect(r.status, `la catégorie « ${categorie} » de ton DTO devrait être acceptée par CategorieValidePipe`).toBe(200);
      }
    });

    it('refuse une catégorie inconnue avec un 400', async () => {
      const r = await http().get('/api/produits/categorie/categorie-qui-nexiste-pas');
      expect(r.status, 'CategorieValidePipe doit lever une BadRequestException').toBe(400);
    });
  });

  describe('4.10 · ?limite= avec DefaultValuePipe(10) et ParseIntPipe', () => {
    beforeAll(async () => {
      // Au moins 11 produits, pour voir la limite par défaut à l'œuvre.
      for (let n = await nombreDeProduits(http); n < 11; n++) {
        await http().post('/api/produits').send(await produitValide(http, { nom: `Produit ${n}` })).expect(201);
      }
    });

    it('sans le paramètre, renvoie les 10 premiers produits', async () => {
      const tous = (await http().get('/api/produits').query({ limite: 100000 }).expect(200)).body;
      const r = await http().get('/api/produits').expect(200);
      expect(r.body, 'DefaultValuePipe(10)').toHaveLength(10);
      expect(r.body).toEqual(tous.slice(0, 10));
    });

    it('avec ?limite=1, renvoie un seul produit (le premier)', async () => {
      const tous = (await http().get('/api/produits').expect(200)).body;
      const r = await http().get('/api/produits').query({ limite: 1 }).expect(200);
      expect(r.body).toEqual(tous.slice(0, 1));
    });

    it('avec ?limite=abc, répond 400 (ParseIntPipe)', async () => {
      const r = await http().get('/api/produits').query({ limite: 'abc' });
      expect(r.status).toBe(400);
    });
  });
});
