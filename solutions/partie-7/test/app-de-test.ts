import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configurerApp } from '../src/configurer-app.js';

// Ce que partagent les fichiers e2e : l'application (avec configurerApp, comme main.ts), la base de
// test vidée avant chaque test, et un compte connecté (7.8 : toutes les routes exigent un jeton).
export async function demarrerApp() {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = module.createNestApplication();
  configurerApp(app);
  await app.init();
  const dataSource = app.get(DataSource);
  const http = () => request(app.getHttpServer());
  return { app, dataSource, http };
}

// 6.14, puis 7.2 : la table comptes, que vendeurs référence, se vide dans la même commande.
export const viderLaBase = (dataSource: DataSource) =>
  dataSource.query('TRUNCATE TABLE lignes_commande, commandes, variantes, produits, vendeurs, comptes RESTART IDENTITY');

export const MOT_DE_PASSE = 'MotDePasse!42';

/** Inscrit un compte (passé au rôle voulu en base), le connecte, et renvoie ses jetons. */
export async function compteConnecte(http: () => ReturnType<typeof request>, dataSource: DataSource, email: string, role?: string) {
  await http().post('/api/auth/inscription').send({ email, motDePasse: MOT_DE_PASSE }).expect(201);
  if (role) await dataSource.query('UPDATE comptes SET role = $1 WHERE email = $2', [role, email]);
  const reponse = await http().post('/api/auth/connexion').send({ email, motDePasse: MOT_DE_PASSE }).expect(200);
  const { accessToken, refreshToken } = reponse.body as { accessToken: string; refreshToken: string };
  return { accessToken, refreshToken, bearer: `Bearer ${accessToken}` };
}
