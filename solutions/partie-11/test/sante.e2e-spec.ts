import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configurerApp } from '../src/configurer-app.js';

// 10.10 : vivant (/sante) et prêt (/sante/pret).
describe('Santé (e2e)', () => {
  let app: INestApplication;
  const journal = vi.fn();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger({ log: journal, warn: vi.fn(), error: vi.fn() });
    configurerApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('vivant : 200 sans jeton, sans rien vérifier', async () => {
    const reponse = await http().get('/sante').expect(200);
    // 8.13 : une réponse réussie est enveloppée dans `{ data }`.
    expect(reponse.body.data).toEqual({ statut: 'ok' });
  });

  it('prêt : 200 quand la base et Redis répondent', async () => {
    const reponse = await http().get('/sante/pret').expect(200);
    expect(reponse.body.data).toMatchObject({ status: 'ok', info: { base: { status: 'up' }, redis: { status: 'up' } } });
  });

  it('n\'est ni limité, ni identifié, ni journalisé', async () => {
    const reponse = await http().get('/sante/pret');
    expect(reponse.headers['x-ratelimit-limit']).toBeUndefined();
    expect(reponse.headers['x-request-id']).toBeUndefined();
    expect(journal).not.toHaveBeenCalledWith(expect.stringContaining('/sante'), expect.anything(), 'HTTP');
  });

  it('prêt : 503 et le détail quand la base est coupée ; vivant reste à 200', async () => {
    await app.get(DataSource).destroy();
    // La 503 passe par SanteFilter : pas d'enveloppe `{ data }`.
    const reponse = await http().get('/sante/pret').expect(503);
    expect(reponse.body).toMatchObject({ status: 'error', error: { base: { status: 'down' } }, info: { redis: { status: 'up' } } });
    await http().get('/sante').expect(200);
    await app.get(DataSource).initialize();
  });
});
