import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { Commande } from './commandes/commande.entity.js';
import { Produit } from './produits/produit.entity.js';
import { Variante } from './produits/variante.entity.js';
import { Vendeur } from './vendeurs/vendeur.entity.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Ce script efface les tables : interdit en production.');
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const dataSource = app.get(DataSource);

await dataSource.query('TRUNCATE TABLE lignes_commande, commandes, variantes, produits, vendeurs RESTART IDENTITY');

const [papeterie, bureau] = await dataSource.getRepository(Vendeur).save([{ nom: 'La Papeterie du Coin' }, { nom: 'Bureau Malin' }]);
const [stylo, cahier, souris, chaise] = await dataSource.getRepository(Produit).save([
  { nom: 'Stylo plume', prix: 12.5, categorie: 'papeterie', vendeur: papeterie },
  { nom: 'Cahier A5', prix: 4, categorie: 'papeterie', vendeur: papeterie },
  { nom: 'Souris sans fil', prix: 25, categorie: 'informatique', vendeur: bureau },
  { nom: 'Chaise de bureau', prix: 129.9, categorie: 'mobilier', vendeur: bureau },
]);
const [styloBleu, styloNoir] = await dataSource.getRepository(Variante).save([
  { nom: 'bleu', stock: 40, produit: stylo },
  { nom: 'noir', stock: 25, produit: stylo },
  { nom: 'ligné', stock: 60, produit: cahier },
  { nom: 'quadrillé', stock: 35, produit: cahier },
  { nom: 'petits carreaux', stock: 20, produit: cahier },
  { nom: 'noire', stock: 15, produit: souris },
  { nom: 'blanche', stock: 10, produit: souris },
  { nom: 'grise', stock: 5, produit: chaise },
  { nom: 'noire', stock: 3, produit: chaise },
]);
await dataSource.getRepository(Commande).save({
  lignes: [
    { variante: styloBleu, quantite: 2 },
    { variante: styloNoir, quantite: 1 },
  ],
});

console.log('2 vendeurs, 4 produits, 9 variantes et 1 commande de 2 lignes créés.');
await app.close();
