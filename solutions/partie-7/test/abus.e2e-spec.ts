import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurerApp } from '../src/configurer-app.js';

// 7.18 à 7.20 : ce fichier, et lui seul, réactive la limitation (.env.test la coupe : THROTTLE_ACTIF=false).
describe('Abus (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.THROTTLE_ACTIF = 'true';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configurerApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.THROTTLE_ACTIF;
  });

  it('bloque la 6e tentative de connexion en une minute (429)', async () => {
    for (let i = 1; i <= 5; i++) {
      await http().post('/api/auth/connexion').send({ email: 'fantome@exemple.fr', motDePasse: 'faux' }).expect(401);
    }
    const reponse = await http().post('/api/auth/connexion').send({ email: 'fantome@exemple.fr', motDePasse: 'faux' }).expect(429);
    expect(reponse.body.message).toBe('ThrottlerException: Too Many Requests');
  });

  it('ajoute les en-têtes de sécurité de helmet et retire X-Powered-By', async () => {
    const reponse = await http().get('/api/auth/moi');
    expect(reponse.headers['x-content-type-options']).toBe('nosniff');
    expect(reponse.headers['x-powered-by']).toBeUndefined();
  });

  it('autorise l\'origine du front, et seulement elle (CORS)', async () => {
    const autorisee = await http().get('/api/auth/moi').set('Origin', 'http://localhost:5173');
    expect(autorisee.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const etrangere = await http().get('/api/auth/moi').set('Origin', 'http://mechant.example');
    expect(etrangere.headers['access-control-allow-origin']).toBeUndefined();
  });
});
