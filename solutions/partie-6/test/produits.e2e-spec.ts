import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configurerApp } from '../src/configurer-app.js';

// 6.14 : un deuxième fichier sur la même base. `fileParallelism: false` (vitest.config.e2e.ts)
// l'empêche de vider les tables pendant que l'autre fichier les lit.
describe('Produits (e2e, avec la vraie base)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configurerApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE lignes_commande, commandes, variantes, produits, vendeurs RESTART IDENTITY');
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée un produit, puis le relit avec ses variantes', async () => {
    await request(app.getHttpServer()).post('/api/produits').send({ nom: 'Cahier', prix: 4, categorie: 'papeterie' }).expect(201);
    await request(app.getHttpServer()).post('/api/produits/1/variantes').send({ nom: 'ligné' }).expect(201);

    const lecture = await request(app.getHttpServer()).get('/api/produits/1').expect(200);
    expect(lecture.body).toMatchObject({ id: 1, nom: 'Cahier', variantes: [{ nom: 'ligné' }] });
  });

  it('ne liste que les produits de ce test', async () => {
    await request(app.getHttpServer()).post('/api/produits').send({ nom: 'Stylo', prix: 2, categorie: 'papeterie' }).expect(201);

    const liste = await request(app.getHttpServer()).get('/api/produits').expect(200);
    expect(liste.body).toHaveLength(1);
  });
});
