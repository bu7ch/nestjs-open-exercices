import { INestApplication } from '@nestjs/common';
import { demarrer } from '../aide.js';

describe('Partie 3 · Produits (exercices 3.4 à 3.6, 3.10)', () => {
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof demarrer>>['http'];

  beforeAll(async () => {
    ({ app, http } = await demarrer());
  });
  afterAll(() => app.close());

  it('3.4 · GET /api/produits renvoie un tableau de produits (id, nom, categorie)', async () => {
    const r = await http().get('/api/produits').expect(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(3);
    for (const p of r.body) {
      expect(typeof p.id).toBe('number');
      expect(typeof p.nom).toBe('string');
      expect(typeof p.categorie).toBe('string');
    }
  });

  it('3.5 · GET /api/produits/:id renvoie le produit demandé', async () => {
    const { body } = await http().get('/api/produits').expect(200);
    expect(body[0], 'termine d\'abord l\'exercice 3.4').toBeDefined();
    const premier = body[0];
    const r = await http().get(`/api/produits/${premier.id}`).expect(200);
    expect(r.body).toEqual(premier);
  });

  it('3.5 · GET /api/produits/:id répond 404 pour un id inconnu', async () => {
    await http().get('/api/produits/999999').expect(404);
  });

  it('3.6 · ?categorie= ne renvoie que les produits de cette catégorie', async () => {
    const { body: tous } = await http().get('/api/produits').expect(200);
    expect(tous[0], 'termine d\'abord l\'exercice 3.4').toBeDefined();
    const categorie = tous[0].categorie;
    const attendus = tous.filter((p: { categorie: string }) => p.categorie === categorie);
    const r = await http().get('/api/produits').query({ categorie }).expect(200);
    expect(r.body).toEqual(attendus);
    expect(r.body.length).toBeGreaterThan(0);
  });

  it('3.6 · une catégorie inconnue renvoie une liste vide', async () => {
    const r = await http().get('/api/produits').query({ categorie: 'categorie-qui-nexiste-pas' }).expect(200);
    expect(r.body).toEqual([]);
  });

  it('3.10 · POST /api/produits répond 201 et le produit apparaît ensuite dans la liste', async () => {
    const avant = (await http().get('/api/produits')).body.length;
    const r = await http().post('/api/produits').send({ nom: 'Clavier mécanique', categorie: 'informatique' }).expect(201);
    expect(r.body).toMatchObject({ nom: 'Clavier mécanique', categorie: 'informatique' });
    expect(typeof r.body.id).toBe('number');
    const apres = (await http().get('/api/produits')).body;
    expect(apres).toHaveLength(avant + 1);
    expect(apres.some((p: { nom: string }) => p.nom === 'Clavier mécanique')).toBe(true);
  });
});
