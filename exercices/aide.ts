/// <reference types="vite/client" />
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

export async function demarrer(): Promise<{ app: INestApplication; http: () => ReturnType<typeof request> }> {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  await app.init();
  return { app, http: () => request(app.getHttpServer()) };
}

const fichiers = import.meta.glob('../src/**/*.ts');

/** Charge `src/<chemin>.ts` ; si le fichier n'existe pas, l'erreur dit lequel créer. */
export async function importer<T = Record<string, unknown>>(chemin: string, indice: string): Promise<T> {
  const charger = fichiers[`../src/${chemin}.ts`];
  if (!charger) throw new Error(`Fichier attendu : src/${chemin}.ts. ${indice}`);
  return (await charger()) as T;
}

export const meta = (cle: string, cible: object): unknown[] => (Reflect.getMetadata(cle, cible) as unknown[] | undefined) ?? [];
