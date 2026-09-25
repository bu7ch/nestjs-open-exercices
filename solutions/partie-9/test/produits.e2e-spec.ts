import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 6.14 : un deuxième fichier sur la même base. `fileParallelism: false` (vitest.config.e2e.ts)
// l'empêche de vider les tables pendant que l'autre fichier les lit.
describe('Produits (e2e, avec la vraie base)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let bearer: string;

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
  });

  beforeEach(async () => {
    await viderLaBase(dataSource);
    ({ bearer } = await compteConnecte(http, dataSource, 'acheteur@exemple.fr'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée un produit, puis le relit avec ses variantes', async () => {
    await http().post('/api/produits').set('Authorization', bearer).send({ nom: 'Cahier', prix: 4, categorie: 'papeterie' }).expect(201);
    await http().post('/api/produits/1/variantes').set('Authorization', bearer).send({ nom: 'ligné' }).expect(201);

    const lecture = await http().get('/api/produits/1').set('Authorization', bearer).expect(200);
    expect(lecture.body.data).toMatchObject({ id: 1, nom: 'Cahier', variantes: [{ nom: 'ligné' }] });
  });

  it('ne liste que les produits de ce test', async () => {
    await http().post('/api/produits').set('Authorization', bearer).send({ nom: 'Stylo', prix: 2, categorie: 'papeterie' }).expect(201);

    const liste = await http().get('/api/produits').set('Authorization', bearer).expect(200);
    expect(liste.body.data).toHaveLength(1);
  });
});
