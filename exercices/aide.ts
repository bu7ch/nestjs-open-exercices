/// <reference types="vite/client" />
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { vi } from 'vitest';

/** Démarre AppModule seul (sans `main.ts`) : suffisant pour la partie 3. */
export async function demarrer(): Promise<{ app: INestApplication; http: () => ReturnType<typeof request> }> {
  const { AppModule } = await importer<{ AppModule: new () => unknown }>('app.module', '');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  await app.init();
  return { app, http: () => request(app.getHttpServer()) };
}

// Tous les fichiers .ts de ton code (sauf les .spec.ts que génère `nest g`).
const fichiers: Record<string, () => Promise<unknown>> = {
  ...import.meta.glob(['../src/**/*.ts', '!../src/**/*.spec.ts']),
  ...import.meta.glob(['../bonus-nba/src/**/*.ts', '!../bonus-nba/src/**/*.spec.ts']),
};

/** Le fichier `<racine>/<chemin>.ts` existe-t-il ? (sans l'exécuter) */
export const existe = (chemin: string, racine = 'src'): boolean => `../${racine}/${chemin}.ts` in fichiers;

/** Charge `<racine>/<chemin>.ts` ; si le fichier n'existe pas, l'erreur dit lequel créer. */
export async function importer<T = Record<string, unknown>>(chemin: string, indice: string, racine = 'src'): Promise<T> {
  const charger = fichiers[`../${racine}/${chemin}.ts`];
  if (!charger) throw new Error(`Fichier attendu : ${racine}/${chemin}.ts. ${indice}`);
  return (await charger()) as T;
}

/**
 * Cherche un export par son nom dans tous les fichiers de `racine` (sauf main.ts),
 * pour ne pas t'imposer d'emplacement quand la consigne n'en donne pas.
 */
export async function trouverExport<T = unknown>(nom: string, indice: string, racine = 'src'): Promise<T> {
  for (const [chemin, charger] of Object.entries(fichiers)) {
    if (!chemin.startsWith(`../${racine}/`) || chemin === `../${racine}/main.ts`) continue;
    let contenu: Record<string, unknown>;
    try {
      contenu = (await charger()) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (nom in contenu) return contenu[nom] as T;
  }
  throw new Error(`Aucun fichier de ${racine}/ n'exporte \`${nom}\`. ${indice}`);
}

export const meta = (cle: string, cible: object): unknown[] => (Reflect.getMetadata(cle, cible) as unknown[] | undefined) ?? [];

/**
 * Les variables d'environnement que les tests fournissent eux-mêmes. Ton `.env` n'est jamais lu :
 * l'application démarre dans un dossier temporaire, avec seulement ce que le test y met.
 */
export const ENV_DES_TESTS: Record<string, string> = { PORT: '0', NOMBRE_MAX_PRODUITS: '1000', NOMBRE_MAX_JOUEURS: '1000' };

export interface OptionsLancement {
  /** Variables à fixer (ou à retirer, avec `undefined`), en plus de ENV_DES_TESTS. */
  env?: Record<string, string | undefined>;
  /** Contenu d'un `.env` écrit dans le dossier temporaire (par défaut : aucun `.env`). */
  fichierEnv?: string;
  /** `auto` : `configurer-app.ts` s'il existe (partie 6), sinon `main.ts`. `main` : toujours `main.ts`. */
  via?: 'auto' | 'main';
  /** Le dossier du projet : `src` (la marketplace) ou `bonus-nba/src` (le projet bonus). */
  racine?: string;
}

export interface AppLancee {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  fermer: () => Promise<void>;
}

/**
 * Démarre TON application telle qu'elle tourne en vrai : en exécutant `main.ts` (avec son
 * `ValidationPipe`, son `ConfigService`…), ou `configurerApp` quand tu l'auras écrite en partie 6.
 * Toujours appeler `fermer()` à la fin (le serveur s'arrête, l'environnement est restauré).
 */
export async function lancer(options: OptionsLancement = {}): Promise<AppLancee> {
  const racine = options.racine ?? 'src';
  const variables = { ...ENV_DES_TESTS, ...options.env };
  const sauvegarde = new Map(Object.keys(variables).map((cle) => [cle, process.env[cle]]));
  const restaurerEnv = () => {
    for (const [cle, valeur] of sauvegarde) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  };
  for (const [cle, valeur] of Object.entries(variables)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }

  // ConfigModule lit `.env` dans le dossier courant : on l'y remplace par celui du test.
  const dossier = mkdtempSync(join(tmpdir(), 'nestjs-open-test-'));
  if (options.fichierEnv !== undefined) writeFileSync(join(dossier, '.env'), options.fichierEnv);
  const dossierInitial = process.cwd();
  process.chdir(dossier);
  // Chaque lancement repart d'un code fraîchement chargé : données en mémoire de départ, .env relu.
  vi.resetModules();

  const configurer = fichiers[`../${racine}/configurer-app.ts`];
  let app: INestApplication | undefined;
  try {
    if (configurer && options.via !== 'main') {
      app = await lancerAvecConfigurerApp(racine, configurer);
    } else {
      app = await lancerMain(racine);
    }
  } catch (erreur) {
    await app?.close().catch(() => undefined);
    restaurerEnv();
    throw erreur;
  } finally {
    process.chdir(dossierInitial);
    rmSync(dossier, { recursive: true, force: true });
  }

  const lancee = app;
  return {
    app: lancee,
    http: () => request(lancee.getHttpServer()),
    fermer: async () => {
      await lancee.close();
      restaurerEnv();
    },
  };
}

async function lancerAvecConfigurerApp(racine: string, configurer: () => Promise<unknown>): Promise<INestApplication> {
  const { configurerApp } = (await configurer()) as { configurerApp: (app: INestApplication) => unknown };
  const { AppModule: Module } = await importer<{ AppModule: new () => unknown }>('app.module', '', racine);
  // Un `ConfigModule.forRoot(...)` qui échoue (variable manquante) est une promesse rejetée dans les
  // imports : on la marque comme suivie, NestJS la relira et remontera l'erreur à la compilation.
  for (const i of meta('imports', Module)) if (i instanceof Promise) i.catch(() => undefined);
  const module = await Test.createTestingModule({ imports: [Module] }).compile();
  const app = module.createNestApplication({ logger: false });
  await configurerApp(app);
  await app.init();
  return app;
}

async function lancerMain(racine: string): Promise<INestApplication> {
  const main = fichiers[`../${racine}/main.ts`];
  if (!main) throw new Error(`Fichier attendu : ${racine}/main.ts.`);
  let app: INestApplication | undefined;
  let echec: { erreur: unknown } | undefined;
  let signalerEchec = () => {};
  const echecSignale = new Promise<void>((resoudre) => (signalerEchec = resoudre));
  const creer = NestFactory.create.bind(NestFactory);
  // On laisse main.ts créer l'application, en coupant les logs et le `process.exit` en cas d'erreur.
  // Si la création échoue, on garde l'erreur pour le test, et bootstrap() reste en attente (pas de
  // rejet non géré, même avec `void bootstrap()`).
  const espion = vi.spyOn(NestFactory, 'create').mockImplementation((async (module: unknown, ...reste: unknown[]) => {
    const adaptateur = reste[0] && typeof reste[0] === 'object' && 'getInstance' in (reste[0] as object) ? reste.shift() : undefined;
    const options = { ...(reste[0] as object | undefined), logger: false as const, abortOnError: false };
    try {
      app = (await (adaptateur ? creer(module as never, adaptateur as never, options) : creer(module as never, options))) as INestApplication;
      return app;
    } catch (erreur) {
      echec = { erreur };
      signalerEchec();
      return new Promise(() => {});
    }
  }) as typeof NestFactory.create);
  try {
    await Promise.race([main(), echecSignale]);
    // Si main.ts n'attend pas bootstrap() (`void bootstrap()`), on attend que le serveur écoute.
    const ecoute = () => (app?.getHttpServer() as { listening?: boolean } | undefined)?.listening === true;
    for (let i = 0; i < 100 && !ecoute() && !echec; i++) await new Promise((r) => setTimeout(r, 20));
    if (echec) throw echec.erreur;
    if (!app) throw new Error(`${racine}/main.ts doit créer l'application avec NestFactory.create(...).`);
    if (!ecoute()) throw new Error(`${racine}/main.ts doit appeler app.listen(...).`);
    return app;
  } catch (erreur) {
    await app?.close().catch(() => undefined);
    throw erreur;
  } finally {
    espion.mockRestore();
  }
}

/** Le port sur lequel l'application écoute vraiment. */
export const portEcoute = (app: INestApplication): number => ((app.getHttpServer() as { address(): AddressInfo }).address()).port;

/** Lance l'application en s'attendant à ce qu'elle REFUSE de démarrer ; renvoie le message d'erreur. */
export async function refusDeDemarrer(options: OptionsLancement, indice = ''): Promise<string> {
  let lancee: AppLancee | undefined;
  try {
    lancee = await lancer(options);
  } catch (erreur) {
    return erreur instanceof Error ? `${erreur.message}\n${erreur.stack ?? ''}` : String(erreur);
  }
  await lancee.fermer();
  throw new Error(`L'application a démarré alors qu'elle aurait dû refuser. ${indice}`);
}
