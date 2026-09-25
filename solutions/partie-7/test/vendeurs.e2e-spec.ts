import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

describe('Vendeurs (e2e, avec la vraie base)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let bearer: string;

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
  });

  // 6.14 : chaque test part de tables vides ; 7.8 : puis se connecte (toutes les routes exigent un jeton).
  beforeEach(async () => {
    await viderLaBase(dataSource);
    ({ bearer } = await compteConnecte(http, dataSource, 'vendeur@exemple.fr', 'vendeur'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée, relit, renomme puis supprime un vendeur', async () => {
    const creation = await http().post('/api/vendeurs').set('Authorization', bearer).send({ nom: 'Atelier du Bois' }).expect(201);
    expect(creation.body).toMatchObject({ id: 1, nom: 'Atelier du Bois' });

    const lecture = await http().get('/api/vendeurs/1').set('Authorization', bearer).expect(200);
    expect(lecture.body).toMatchObject({ id: 1, nom: 'Atelier du Bois' });

    await http().patch('/api/vendeurs/1').set('Authorization', bearer).send({ nom: 'Atelier du Chêne' }).expect(200);
    const renomme = await http().get('/api/vendeurs/1').set('Authorization', bearer).expect(200);
    expect(renomme.body.nom).toBe('Atelier du Chêne');

    await http().delete('/api/vendeurs/1').set('Authorization', bearer).expect(204);
    await http().get('/api/vendeurs/1').set('Authorization', bearer).expect(404);
  });

  it('répond 409 quand on supprime un vendeur dont un produit a été commandé', async () => {
    await http().post('/api/vendeurs').set('Authorization', bearer).send({ nom: 'Atelier du Bois' }).expect(201);
    await http().post('/api/vendeurs/1/produits').set('Authorization', bearer).send({ nom: 'Lampe', prix: 30, categorie: 'mobilier' }).expect(201);
    await http().post('/api/produits/1/variantes').set('Authorization', bearer).send({ nom: 'Rouge' }).expect(201);
    await http()
      .post('/api/commandes')
      .set('Authorization', bearer)
      .send({ lignes: [{ varianteId: 1, quantite: 2 }] })
      .expect(201);

    await http().delete('/api/vendeurs/1').set('Authorization', bearer).expect(409);

    const [{ total }] = await dataSource.query('SELECT count(*)::int AS total FROM vendeurs');
    expect(total).toBe(1);
  });

  it('répond 404 pour un vendeur inconnu', async () => {
    await http().get('/api/vendeurs/99').set('Authorization', bearer).expect(404);
  });

  it('répond 401 sans jeton (7.8)', async () => {
    await http().get('/api/vendeurs').expect(401);
  });
});
