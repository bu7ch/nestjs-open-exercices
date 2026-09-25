import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configurerApp } from '../src/configurer-app.js';

describe('Vendeurs (e2e, avec la vraie base)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configurerApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  // 6.14 : chaque test part de tables vides, avec des identifiants qui repartent à 1.
  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE lignes_commande, commandes, variantes, produits, vendeurs RESTART IDENTITY');
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée, relit, renomme puis supprime un vendeur', async () => {
    const creation = await request(app.getHttpServer()).post('/api/vendeurs').send({ nom: 'Atelier du Bois' }).expect(201);
    expect(creation.body).toMatchObject({ id: 1, nom: 'Atelier du Bois' });

    const lecture = await request(app.getHttpServer()).get('/api/vendeurs/1').expect(200);
    expect(lecture.body).toMatchObject({ id: 1, nom: 'Atelier du Bois' });

    await request(app.getHttpServer()).patch('/api/vendeurs/1').send({ nom: 'Atelier du Chêne' }).expect(200);
    const renomme = await request(app.getHttpServer()).get('/api/vendeurs/1').expect(200);
    expect(renomme.body.nom).toBe('Atelier du Chêne');

    await request(app.getHttpServer()).delete('/api/vendeurs/1').expect(204);
    await request(app.getHttpServer()).get('/api/vendeurs/1').expect(404);
  });

  it('répond 409 quand on supprime un vendeur dont un produit a été commandé', async () => {
    await request(app.getHttpServer()).post('/api/vendeurs').send({ nom: 'Atelier du Bois' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/vendeurs/1/produits')
      .send({ nom: 'Lampe', prix: 30, categorie: 'mobilier' })
      .expect(201);
    await request(app.getHttpServer()).post('/api/produits/1/variantes').send({ nom: 'Rouge' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/commandes')
      .send({ lignes: [{ varianteId: 1, quantite: 2 }] })
      .expect(201);

    await request(app.getHttpServer()).delete('/api/vendeurs/1').expect(409);

    const [{ total }] = await dataSource.query('SELECT count(*)::int AS total FROM vendeurs');
    expect(total).toBe(1);
  });

  it('répond 404 pour un vendeur inconnu', async () => {
    await request(app.getHttpServer()).get('/api/vendeurs/99').expect(404);
  });
});
