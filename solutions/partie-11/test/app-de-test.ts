import { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configurerApp } from '../src/configurer-app.js';
import { configurerSwagger } from '../src/configurer-swagger.js';
import type { ClientVersServeur, ServeurVersClient } from '../src/temps-reel/evenements.js';

// Ce que partagent les fichiers e2e : l'application (avec configurerApp, comme main.ts), la base de
// test vidée avant chaque test, et un compte connecté (7.8 : toutes les routes exigent un jeton).
// 9.3 : la documentation est générée AVANT app.init() (après, /docs répondrait 404).
// 11.1 : l'application écoute sur un vrai port (`listen(0)`) : un client socket.io en a besoin.
// 11.13 : `rawBody: true`, comme dans main.ts (l'option se donne à la création).
// Bonus 11.10 : `surcharger` modifie le module de test avant sa compilation (une doublure).
export async function demarrerApp(surcharger: (constructeur: TestingModuleBuilder) => TestingModuleBuilder = (c) => c) {
  const module = await surcharger(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app: INestApplication = module.createNestApplication({ rawBody: true });
  configurerApp(app);
  const document = configurerSwagger(app);
  await app.listen(0);
  const dataSource = app.get(DataSource);
  const http = () => request(app.getHttpServer());
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return { app, dataSource, http, document, url };
}

// 6.14, puis 7.2 : la table comptes, que vendeurs (et commandes, 11.5) référencent, se vide dans la même commande.
export const viderLaBase = (dataSource: DataSource) =>
  dataSource.query('TRUNCATE TABLE lignes_commande, commandes, variantes, produits, vendeurs, comptes, evenements_recus RESTART IDENTITY');

export const MOT_DE_PASSE = 'MotDePasse!42';

/** Inscrit un compte (passé au rôle voulu en base), le connecte, et renvoie ses jetons. */
export async function compteConnecte(http: () => ReturnType<typeof request>, dataSource: DataSource, email: string, role?: string) {
  await http().post('/api/auth/inscription').send({ email, motDePasse: MOT_DE_PASSE }).expect(201);
  if (role) await dataSource.query('UPDATE comptes SET role = $1 WHERE email = $2', [role, email]);
  const reponse = await http().post('/api/auth/connexion').send({ email, motDePasse: MOT_DE_PASSE }).expect(200);
  // 8.13 : toute réponse réussie est enveloppée dans `{ data }`.
  const { accessToken, refreshToken } = reponse.body.data as { accessToken: string; refreshToken: string };
  return { accessToken, refreshToken, bearer: `Bearer ${accessToken}` };
}

// --- 11.1 : de vrais clients socket.io ------------------------------------------------------------

/** Côté client, les deux interfaces sont inversées : ce que le serveur envoie, le client l'écoute. */
export type ClientDeCommandes = Socket<ServeurVersClient, ClientVersServeur>;

/** 11.4 : le jeton part dans la poignée de main ; un refus rejette avec son message (et referme le client). */
export function connecter(url: string, jeton?: string, options: { reconnexion?: boolean } = {}): Promise<ClientDeCommandes> {
  const client: ClientDeCommandes = io(url, {
    transports: ['websocket'],
    auth: jeton ? { jeton } : {},
    reconnection: options.reconnexion === true,
    reconnectionDelay: 50,
    forceNew: true,
  });
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', (erreur) => {
      client.close();
      reject(erreur);
    });
  });
}

/** Le prochain `evenement` reçu par ce client (au plus 3 s : un événement qui n'arrive pas le dit). */
export function attendre<E extends keyof ServeurVersClient>(client: ClientDeCommandes, evenement: E): Promise<Parameters<ServeurVersClient[E]>[0]> {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error(`${evenement} jamais reçu`)), 3000);
    client.once(evenement, ((valeur: never) => {
      clearTimeout(minuteur);
      resolve(valeur);
    }) as never);
  });
}
