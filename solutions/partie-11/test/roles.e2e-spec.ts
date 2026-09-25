import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 7.12 : les rôles ; 7.14 : la propriété des produits.
describe('Rôles et propriété (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
  });

  beforeEach(async () => {
    await viderLaBase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/comptes', () => {
    it('refuse un acheteur (403)', async () => {
      const { bearer } = await compteConnecte(http, dataSource, 'acheteur@exemple.fr');
      const reponse = await http().get('/api/comptes').set('Authorization', bearer).expect(403);
      expect(reponse.body.message).toBe('Rôle insuffisant');
    });

    it('répond 401, pas 403, à quelqu\'un qui n\'est pas connecté', async () => {
      await http().get('/api/comptes').expect(401);
    });

    it('laisse passer un admin, sans jamais renvoyer les empreintes', async () => {
      const { bearer } = await compteConnecte(http, dataSource, 'chef@exemple.fr', 'admin');
      const reponse = await http().get('/api/comptes').set('Authorization', bearer).expect(200);
      expect(reponse.body.data).toEqual([{ id: 1, email: 'chef@exemple.fr', role: 'admin' }]);
    });
  });

  describe('PATCH /api/produits/:id', () => {
    let alice: string;
    let bob: string;

    // Alice et Bob sont vendeurs ; chacun crée sa boutique (elle appartient au compte connecté).
    beforeEach(async () => {
      ({ bearer: alice } = await compteConnecte(http, dataSource, 'alice@exemple.fr', 'vendeur'));
      ({ bearer: bob } = await compteConnecte(http, dataSource, 'bob@exemple.fr', 'vendeur'));
      await http().post('/api/vendeurs').set('Authorization', alice).send({ nom: 'Chez Alice' }).expect(201);
      await http().post('/api/vendeurs/1/produits').set('Authorization', alice).send({ nom: 'Lampe', prix: 30, categorie: 'mobilier' }).expect(201);
    });

    it('laisse le propriétaire renommer son produit', async () => {
      const reponse = await http().patch('/api/produits/1').set('Authorization', alice).send({ nom: 'Lampe de chevet' }).expect(200);
      expect(reponse.body.data.nom).toBe('Lampe de chevet');
    });

    it('refuse un autre vendeur (403), sans rien changer', async () => {
      const reponse = await http().patch('/api/produits/1').set('Authorization', bob).send({ nom: 'Volée' }).expect(403);
      expect(reponse.body.message).toBe('Ce produit ne t\'appartient pas');
      const produit = await http().get('/api/produits/1').set('Authorization', bob).expect(200);
      expect(produit.body.data.nom).toBe('Lampe');
    });

    it('laisse un admin renommer le produit d\'un autre', async () => {
      const { bearer: admin } = await compteConnecte(http, dataSource, 'chef@exemple.fr', 'admin');
      await http().patch('/api/produits/1').set('Authorization', admin).send({ nom: 'Renommée' }).expect(200);
    });

    it('répond 404 pour un produit inconnu', async () => {
      await http().patch('/api/produits/99').set('Authorization', alice).send({ nom: 'Personne' }).expect(404);
    });

    it('refuse un identifiant de propriétaire dans le corps', async () => {
      const reponse = await http().patch('/api/produits/1').set('Authorization', bob).send({ nom: 'Volée', vendeurId: 2 }).expect(400);
      expect(reponse.body.message).toContain('property vendeurId should not exist');
    });
  });
});
