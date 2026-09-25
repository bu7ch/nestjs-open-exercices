import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 8.12 : le client reçoit un 408, mais le handler va au bout de son travail.
describe('Délai maximal (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let bearer: string;

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
    await viderLaBase(dataSource);
    ({ bearer } = await compteConnecte(http, dataSource, 'patient@exemple.fr'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('répond 408, puis le handler finit quand même son travail', async () => {
    const reponse = await http().get('/api/demo/lente').set('Authorization', bearer).expect(408);
    expect(reponse.body.message).toBe('La requête a pris trop de temps');

    const aussitot = await http().get('/api/demo/travaux').set('Authorization', bearer).expect(200);
    expect(aussitot.body.data.termines).toBe(0);

    // Une écriture en base lancée par ce handler aurait donc lieu, alors que le client a reçu une erreur.
    await vi.waitFor(async () => {
      const plusTard = await http().get('/api/demo/travaux').set('Authorization', bearer);
      expect(plusTard.body.data.termines).toBe(1);
    });
  });
});
