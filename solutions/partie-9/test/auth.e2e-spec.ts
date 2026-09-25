import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 7.10 : le guard, de bout en bout, sur la route `moi`.
describe('Auth (e2e)', () => {
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

  describe('GET /api/auth/moi', () => {
    it('refuse une requête sans jeton', async () => {
      await http().get('/api/auth/moi').expect(401);
    });

    it('renvoie le profil avec un jeton valide, sans le hachage', async () => {
      // Le jeton d'abord, dans une variable : un `await` au milieu de la requête ferait tomber Supertest.
      const { bearer } = await compteConnecte(http, dataSource, 'louve@exemple.fr');
      const reponse = await http().get('/api/auth/moi').set('Authorization', bearer).expect(200);
      expect(reponse.body.data).toEqual({ id: 1, email: 'louve@exemple.fr', role: 'acheteur' });
    });

    it('refuse un jeton falsifié', async () => {
      const { accessToken } = await compteConnecte(http, dataSource, 'louve@exemple.fr');
      const [entete, , signature] = accessToken.split('.');
      const faux = Buffer.from(JSON.stringify({ sub: 1, email: 'louve@exemple.fr', role: 'admin' })).toString('base64url');
      await http().get('/api/auth/moi').set('Authorization', `Bearer ${entete}.${faux}.${signature}`).expect(401);
    });

    it('refuse un jeton expiré', async () => {
      await compteConnecte(http, dataSource, 'louve@exemple.fr');
      const expire = await app.get(JwtService).signAsync({ sub: 1, email: 'louve@exemple.fr', role: 'acheteur' }, { expiresIn: -10 });
      const reponse = await http().get('/api/auth/moi').set('Authorization', `Bearer ${expire}`).expect(401);
      expect(reponse.body.message).toBe('Jeton invalide ou expiré');
    });
  });
});
