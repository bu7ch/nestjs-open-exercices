import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 9.12 : le classement des vendeurs, sur un jeu de données fait à la main.
describe('Classement des vendeurs (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let bearer: string;

  const commander = (lignes: [number, number][]) =>
    http().post('/api/commandes').set('Authorization', bearer).send({ lignes: lignes.map(([varianteId, quantite]) => ({ varianteId, quantite })) }).expect(201);

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
  });

  beforeEach(async () => {
    await viderLaBase(dataSource);
    ({ bearer } = await compteConnecte(http, dataSource, 'acheteur@exemple.fr'));
    // Vendeurs 1 à 4 ; un produit (et sa variante, même identifiant) par vendeur, sauf Alpha qui en a deux.
    await dataSource.query(`INSERT INTO vendeurs (nom) VALUES ('Alpha'), ('Bravo'), ('Charlie'), ('Delta')`);
    await dataSource.query(`INSERT INTO produits (nom, prix, categorie, "vendeurId") VALUES ('A10', 10, 'mobilier', 1), ('B20', 20, 'mobilier', 2), ('C60', 60, 'mobilier', 3), ('D15', 15, 'mobilier', 4), ('A30', 30, 'mobilier', 1)`);
    await dataSource.query(`INSERT INTO variantes (nom, "produitId") SELECT 'Unique', id FROM produits ORDER BY id`);
    // Alpha : 2 commandes, 100 € ; Bravo : 3 commandes, 60 € ; Charlie : 1 commande, 60 € ; Delta : 1 commande, 15 €.
    await commander([[1, 5]]);
    await commander([[1, 2], [5, 1], [4, 1]]);
    await commander([[2, 1]]);
    await commander([[2, 1]]);
    await commander([[2, 1]]);
    await commander([[3, 1]]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('classe par chiffre d\'affaires, puis par nombre de commandes', async () => {
    const r = await http().get('/api/classement-vendeurs').set('Authorization', bearer).expect(200);
    expect(r.body.data.donnees).toEqual([
      { rang: 1, vendeurId: 1, nom: 'Alpha', commandes: 2, chiffreAffaires: 100 },
      // Bravo et Charlie : 60 € chacun ; Bravo a plus de commandes.
      { rang: 2, vendeurId: 2, nom: 'Bravo', commandes: 3, chiffreAffaires: 60 },
      { rang: 3, vendeurId: 3, nom: 'Charlie', commandes: 1, chiffreAffaires: 60 },
      { rang: 4, vendeurId: 4, nom: 'Delta', commandes: 1, chiffreAffaires: 15 },
    ]);
  });

  it('pagine sans perdre les rangs', async () => {
    const r = await http().get('/api/classement-vendeurs?limite=2&page=2').set('Authorization', bearer).expect(200);
    expect(r.body.data.donnees.map((l: { rang: number; nom: string }) => [l.rang, l.nom])).toEqual([[3, 'Charlie'], [4, 'Delta']]);
    expect(r.body.data.meta).toEqual({ page: 2, limite: 2, total: 4, totalPages: 2 });
  });
});
