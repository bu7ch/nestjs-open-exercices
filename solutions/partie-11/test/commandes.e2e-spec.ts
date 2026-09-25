import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 8.7 : on n'expédie qu'une commande payée ; 8.8 : chaque vendeur ne voit que ses commandes.
describe('Commandes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let alice: string;
  let bob: string;
  let admin: string;

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
  });

  // Alice (vendeur 1) et Bob (vendeur 2) ont chacun une boutique, un produit, une commande.
  beforeEach(async () => {
    await viderLaBase(dataSource);
    ({ bearer: alice } = await compteConnecte(http, dataSource, 'alice@exemple.fr', 'vendeur'));
    ({ bearer: bob } = await compteConnecte(http, dataSource, 'bob@exemple.fr', 'vendeur'));
    ({ bearer: admin } = await compteConnecte(http, dataSource, 'chef@exemple.fr', 'admin'));
    for (const [bearer, nom] of [[alice, 'Chez Alice'], [bob, 'Chez Bob']] as const) {
      const vendeur = await http().post('/api/vendeurs').set('Authorization', bearer).send({ nom }).expect(201);
      const produit = await http().post(`/api/vendeurs/${vendeur.body.data.id}/produits`).set('Authorization', bearer).send({ nom: 'Lampe', prix: 30, categorie: 'mobilier' }).expect(201);
      const variante = await http().post(`/api/produits/${produit.body.data.id}/variantes`).set('Authorization', bearer).send({ nom: 'Rouge' }).expect(201);
      await http().post('/api/commandes').set('Authorization', admin).send({ lignes: [{ varianteId: variante.body.data.id, quantite: 1 }] }).expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/commandes/:id/expedier', () => {
    it('refuse une commande en attente (403), avec son statut dans le message', async () => {
      const reponse = await http().post('/api/commandes/1/expedier').set('Authorization', admin).expect(403);
      expect(reponse.body.message).toContain('en_attente');
    });

    it('expédie une commande payée', async () => {
      await dataSource.query('UPDATE commandes SET statut = \'payee\' WHERE id = 1');
      const reponse = await http().post('/api/commandes/1/expedier').set('Authorization', admin).expect(200);
      expect(reponse.body.data.statut).toBe('expediee');
    });

    it('répond 404 pour une commande inconnue, et 400 pour un identifiant absurde', async () => {
      await http().post('/api/commandes/99/expedier').set('Authorization', admin).expect(404);
      await http().post('/api/commandes/abc/expedier').set('Authorization', admin).expect(400);
    });
  });

  describe('GET /api/vendeurs/:vendeurId/commandes', () => {
    it('montre ses commandes au propriétaire, et seulement les siennes', async () => {
      const reponse = await http().get('/api/vendeurs/1/commandes').set('Authorization', alice).expect(200);
      expect(reponse.body.data.map((c: { id: number }) => c.id)).toEqual([1]);
    });

    it('refuse les commandes d\'un autre vendeur (403)', async () => {
      await http().get('/api/vendeurs/1/commandes').set('Authorization', bob).expect(403);
    });

    it('laisse un admin voir celles de tous', async () => {
      const reponse = await http().get('/api/vendeurs/2/commandes').set('Authorization', admin).expect(200);
      expect(reponse.body.data.map((c: { id: number }) => c.id)).toEqual([2]);
    });

    it('répond 404 pour un vendeur inconnu, et 400 pour un identifiant absurde', async () => {
      await http().get('/api/vendeurs/99/commandes').set('Authorization', alice).expect(404);
      await http().get('/api/vendeurs/abc/commandes').set('Authorization', alice).expect(400);
    });
  });
});
