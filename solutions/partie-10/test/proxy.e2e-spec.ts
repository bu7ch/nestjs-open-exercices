import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurerApp } from '../src/configurer-app.js';
import { REDIS } from '../src/redis/redis.module.js';

// 10.15 : derrière un reverse proxy, chaque client est compté à part, d'après X-Forwarded-For.
describe('Derrière un proxy (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const connexion = (ip: string) =>
    http().post('/api/auth/connexion').set('X-Forwarded-For', ip).send({ email: 'personne@exemple.fr', motDePasse: 'mauvais-mdp' });

  beforeAll(async () => {
    process.env.THROTTLE_ACTIF = 'true';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configurerApp(app);
    await app.init();
  });

  beforeEach(async () => {
    await app.get<Redis>(REDIS).flushdb();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.THROTTLE_ACTIF;
  });

  it('compte chaque client à part, d\'après X-Forwarded-For', async () => {
    for (let i = 0; i < 5; i++) await connexion('203.0.113.1').expect(401);
    await connexion('203.0.113.1').expect(429);
    await connexion('203.0.113.2').expect(401);
  });
});
