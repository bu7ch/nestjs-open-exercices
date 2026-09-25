import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 7.16 : la rotation, la détection de réutilisation, la déconnexion.
describe('Refresh token (e2e)', () => {
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

  const connecter = () => compteConnecte(http, dataSource, 'louve@exemple.fr');
  const rafraichir = (refreshToken: string) => http().post('/api/auth/rafraichir').send({ refreshToken });
  const empreinte = async () => (await dataSource.query('SELECT "refreshTokenHache" FROM comptes WHERE id = 1'))[0].refreshTokenHache as string | null;

  it('échange un refresh token contre une nouvelle paire', async () => {
    const jetons = await connecter();
    const reponse = await rafraichir(jetons.refreshToken).expect(200);
    expect(reponse.body.data.refreshToken).not.toBe(jetons.refreshToken);

    await http().get('/api/auth/moi').set('Authorization', `Bearer ${reponse.body.data.accessToken}`).expect(200);
  });

  it('ne stocke que l\'empreinte du refresh token', async () => {
    const jetons = await connecter();
    const stockee = await empreinte();
    expect(stockee).toMatch(/^\$argon2id\$/);
    expect(stockee).not.toBe(jetons.refreshToken);
  });

  it('refuse de réutiliser un refresh token déjà échangé, et révoque la session', async () => {
    const jetons = await connecter();
    const suite = await rafraichir(jetons.refreshToken).expect(200);

    await rafraichir(jetons.refreshToken).expect(401);
    expect(await empreinte()).toBeNull();
    await rafraichir(suite.body.data.refreshToken).expect(401);
  });

  it('refuse un jeton d\'accès à la place d\'un refresh token, et l\'inverse', async () => {
    const jetons = await connecter();
    await rafraichir(jetons.accessToken).expect(401);
    await http().get('/api/auth/moi').set('Authorization', `Bearer ${jetons.refreshToken}`).expect(401);
  });

  it('invalide le refresh token à la déconnexion', async () => {
    const jetons = await connecter();
    await http().post('/api/auth/deconnexion').set('Authorization', `Bearer ${jetons.accessToken}`).expect(204);
    await rafraichir(jetons.refreshToken).expect(401);
  });
});
