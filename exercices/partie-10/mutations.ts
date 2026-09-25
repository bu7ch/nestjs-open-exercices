// Fichier de préparation (setupFiles) chargé AVANT chacun de TES fichiers de test, quand les tests de
// la partie 10 font tourner tes tests dans une copie temporaire de ton projet (jamais dans ton dépôt),
// comme en parties 6, 8 et 9 (voir exercices/partie-6/mutations.ts).
//
// Il introduit, à la demande, une « mutation » : un bug précis dans ta validation d'environnement (10.1),
// ton `creerLogger` (10.11), ton SanteController et l'exclusion du middleware (10.10), ou `trust proxy`
// (10.15). Un bon test doit alors ÉCHOUER. Ton code n'est jamais réécrit : la mutation l'enveloppe, et ne
// change son comportement QUE sur le cas visé.
import { ServiceUnavailableException } from '@nestjs/common';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { vi } from 'vitest';

interface Cible {
  fichier: string;
  export: string;
}

interface Plan {
  controle: string;
  cibles10: {
    env?: Cible;
    journal?: Cible;
    /** SanteController, et le nom de ses méthodes `/sante` (vivant) et `/sante/pret` (prêt). */
    sante?: Cible & { vivant?: string; pret: string };
    appModule?: Cible;
  };
}

const plan = JSON.parse(readFileSync(process.env.P6_PLAN!, 'utf8')) as Plan;
const racine = dirname(dirname(process.env.P6_PLAN!));
const absolu = (fichier: string) => (isAbsolute(fichier) ? fichier : join(racine, fichier));
const mutation = (): string => readFileSync(plan.controle, 'utf8').trim();

type Fonction = (...args: unknown[]) => unknown;

/** Remplace l'export `cible.export` par ce que `envelopper` fabrique à partir de l'original. */
function envelopperExport(cible: Cible | undefined, prefixe: string, envelopper: (origine: any) => unknown) {
  if (!cible) return;
  vi.doMock(absolu(cible.fichier), async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    if (!mutation().startsWith(prefixe) || origine[cible.export] === undefined) return origine;
    return { ...origine, [cible.export]: envelopper(origine[cible.export]) };
  });
}

// --- 10.1 : validerEnvironnement ------------------------------------------------------------------

const NODE_ENV_VALIDES = ['development', 'production', 'test'];

envelopperExport(plan.cibles10.env, 'env:', (valider: (c: Record<string, unknown>) => Record<string, unknown>) => (config: Record<string, unknown>) => {
  const m = mutation();
  // Les nombres ne sont plus convertis : NOMBRE_MAX_PRODUITS reste une chaîne.
  if (m === 'env:sans-conversion') {
    const resultat = valider(config);
    if (config.NOMBRE_MAX_PRODUITS !== undefined) (resultat as Record<string, unknown>).NOMBRE_MAX_PRODUITS = config.NOMBRE_MAX_PRODUITS;
    return resultat;
  }
  // DB_HOST n'est plus obligatoire.
  if (m === 'env:db-host-facultatif' && (config.DB_HOST === undefined || config.DB_HOST === '')) {
    const resultat = valider({ ...config, DB_HOST: 'localhost' });
    delete (resultat as Record<string, unknown>).DB_HOST;
    return resultat;
  }
  // NODE_ENV accepte n'importe quelle valeur.
  if (m === 'env:node-env-libre' && config.NODE_ENV !== undefined && !NODE_ENV_VALIDES.includes(String(config.NODE_ENV))) {
    const resultat = valider({ ...config, NODE_ENV: 'production' });
    (resultat as Record<string, unknown>).NODE_ENV = config.NODE_ENV;
    return resultat;
  }
  return valider(config);
});

// --- 10.11 : creerLogger ------------------------------------------------------------------------------

type Logger = Record<string, unknown> & { log: Fonction; setLogLevels?: (niveaux: string[]) => void };

envelopperExport(plan.cibles10.journal, 'journal:', (creer: (production: boolean) => Logger) => (production: boolean) => {
  const m = mutation();
  // Du texte en production.
  if (m === 'journal:texte-en-production' && production) return creer(false);
  // Du JSON en développement.
  if (m === 'journal:json-en-developpement' && !production) return creer(true);
  const logger = creer(production);
  // debug et verbose écrits en production.
  if (m === 'journal:debug-en-production' && production) logger.setLogLevels?.(['verbose', 'debug', 'log', 'warn', 'error', 'fatal']);
  // Les paramètres (l'objet entre le message et le contexte) sont perdus.
  if (m === 'journal:sans-params') {
    const log = logger.log.bind(logger);
    logger.log = (message: unknown, ...reste: unknown[]) => log(message, ...reste.filter((x) => typeof x !== 'object' || x === null));
  }
  // Le contexte (le dernier argument, `'HTTP'`) est perdu.
  if (m === 'journal:sans-contexte') {
    const log = logger.log.bind(logger);
    logger.log = (message: unknown, ...reste: unknown[]) => log(message, ...(reste.length > 0 && typeof reste.at(-1) === 'string' ? reste.slice(0, -1) : reste));
  }
  return logger;
});

// --- 10.10 : SanteController, et l'exclusion du middleware --------------------------------------------

/** Remplace une méthode du prototype, en gardant les métadonnées de NestJS (route, décorateurs…). */
function remplacerMethode(proto: Record<string, unknown>, nom: string, mutant: (origine: Fonction, soi: unknown, args: unknown[]) => unknown) {
  const origine = proto[nom];
  if (typeof origine !== 'function') return;
  const neuve = function (this: unknown, ...args: unknown[]) {
    return mutant(origine as Fonction, this, args);
  };
  for (const cle of Reflect.getOwnMetadataKeys(origine)) Reflect.defineMetadata(cle, Reflect.getOwnMetadata(cle, origine), neuve);
  Object.defineProperty(neuve, 'name', { value: nom });
  proto[nom] = neuve;
}

const sante = plan.cibles10.sante;
if (sante) {
  vi.doMock(absolu(sante.fichier), async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    const classe = origine[sante.export] as (Function & { prototype: Record<string, unknown> }) | undefined;
    if (!mutation().startsWith('sante:') || typeof classe !== 'function') return origine;
    const proto = classe.prototype;
    const pret = proto[sante.pret] as Fonction;
    remplacerMethode(proto, sante.pret, async (origineFn, soi, args) => {
      const m = mutation();
      try {
        return await origineFn.apply(soi, args);
      } catch (erreur) {
        // Toujours « prêt » : la panne est avalée, 200.
        if (m === 'sante:pret-toujours-200') return { status: 'ok', info: {}, error: {}, details: {} };
        // La 503 perd son rapport (ce qu'afficherait ToutesExceptionsFilter sans SanteFilter).
        if (m === 'sante:sans-detail') throw new ServiceUnavailableException();
        throw erreur;
      }
    });
    // « Vivant » vérifie la base (l'erreur classique) : /sante tombe avec elle.
    if (sante.vivant) {
      remplacerMethode(proto, sante.vivant, async (origineFn, soi, args) => {
        if (mutation() === 'sante:vivant-verifie-la-base') await pret.apply(soi, []);
        return origineFn.apply(soi, args);
      });
    }
    return origine;
  });
}

// L'exclusion du RequeteIdMiddleware ne s'applique plus (`/sante/pret` reçoit un X-Request-Id).
const appModule = plan.cibles10.appModule;
if (appModule) {
  vi.doMock(absolu(appModule.fichier), async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    const classe = origine[appModule.export] as (Function & { prototype: Record<string, unknown> }) | undefined;
    if (mutation() !== 'sante:identifiee' || typeof classe !== 'function' || typeof classe.prototype.configure !== 'function') return origine;
    const configure = classe.prototype.configure as Fonction;
    classe.prototype.configure = function (this: unknown, consumer: Record<string, Fonction>) {
      const espion = new Proxy(consumer, {
        get(cible, cle) {
          const valeur = Reflect.get(cible, cle, cible) as unknown;
          if (cle !== 'apply' || typeof valeur !== 'function') return typeof valeur === 'function' ? (valeur as Fonction).bind(cible) : valeur;
          return (...middlewares: unknown[]) => {
            const suite = (valeur as Fonction).apply(cible, middlewares) as Record<string, unknown>;
            const proxy: Record<string, unknown> = new Proxy(suite, {
              get(s, k) {
                if (k === 'exclude') return () => proxy;
                const v = Reflect.get(s, k, s) as unknown;
                return typeof v === 'function' ? (v as Fonction).bind(s) : v;
              },
            });
            return proxy;
          };
        },
      });
      return configure.call(this, espion);
    };
    return origine;
  });
}

// --- 10.15 : trust proxy ------------------------------------------------------------------------------

// Où que tu règles `trust proxy`, il reste coupé : Express compte tous les clients ensemble.
{
  const exiger = createRequire(join(racine, 'package.json'));
  const express = exiger('express') as { application: { set: Fonction } };
  const set = express.application.set;
  express.application.set = function (this: unknown, ...args: unknown[]) {
    if (args.length === 2 && args[0] === 'trust proxy' && mutation() === 'proxy:sans-trust-proxy') return set.call(this, 'trust proxy', false);
    return set.apply(this, args);
  };
}
