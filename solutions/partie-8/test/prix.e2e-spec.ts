import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configurerApp } from '../src/configurer-app.js';
import { PrixModule } from '../src/prix/prix.module.js';

describe('Prix (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PrixModule] }).compile();
    app = module.createNestApplication();
    configurerApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/prix/total calcule le total', async () => {
    const reponse = await request(app.getHttpServer())
      .post('/api/prix/total')
      .send({ prixUnitaire: 100, quantite: 10 })
      .expect(201);

    expect(reponse.body).toEqual({ total: 900 });
  });

  it('refuse une quantité de 0 avec un 400', async () => {
    const reponse = await request(app.getHttpServer())
      .post('/api/prix/total')
      .send({ prixUnitaire: 100, quantite: 0 })
      .expect(400);

    expect(reponse.body.message).toContain('quantite must not be less than 1');
  });

  it('refuse un champ en trop', async () => {
    const reponse = await request(app.getHttpServer())
      .post('/api/prix/total')
      .send({ prixUnitaire: 100, quantite: 10, remise: 50 })
      .expect(400);

    expect(reponse.body.message).toContain('property remise should not exist');
  });
});
