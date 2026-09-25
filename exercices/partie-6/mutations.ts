// Fichier de préparation (setupFiles) chargé AVANT chacun de TES fichiers de test, quand les tests de
// la partie 6 font tourner tes tests dans une copie temporaire de ton projet (jamais dans ton dépôt).
//
// Il introduit, à la demande, une « mutation » : un bug connu, petit et précis, dans le code que tes
// tests protègent (un palier de prix décalé, une transition de commande autorisée à tort, une route
// qui ne supprime plus rien…). Un bon test doit alors ÉCHOUER. Le code d'origine n'est jamais réécrit :
// la mutation l'enveloppe, et ne change son comportement QUE sur le cas visé. Tout le reste de ton
// code (messages d'erreur, arrondis, noms…) se comporte exactement comme tu l'as écrit.
//
// La mutation en cours est lue dans un fichier de contrôle (`aucune` = ton code tel quel).
import { appendFileSync, readFileSync } from 'node:fs';
import { catchError, map, of, throwError, type Observable } from 'rxjs';
import { expect, vi } from 'vitest';

interface Cible {
  fichier: string;
  export: string;
  genre?: 'fonction' | 'classe';
}

interface Plan {
  controle: string;
  journal: string;
  cibles: { prix?: Cible; transitions?: Cible; produits?: Cible; configurerApp?: Cible };
}

const plan = JSON.parse(readFileSync(process.env.P6_PLAN!, 'utf8')) as Plan;
const mutation = (): string => readFileSync(plan.controle, 'utf8').trim();

type Fonction = (...args: unknown[]) => unknown;
type Classe = new (...args: unknown[]) => Record<string, unknown>;

/**
 * Une sous-classe de même nom : les arguments du constructeur passent par `entree` (NestJS injecte
 * les mêmes dépendances, ses métadonnées sont héritées), puis `sortie` enveloppe l'instance construite
 * (méthodes du prototype comme propriétés fléchées).
 */
function envelopperClasse(Base: Classe, entree: (args: unknown[]) => unknown[], sortie: (instance: Record<string, unknown>) => void): Classe {
  const nom = Base.name;
  return {
    [nom]: class extends Base {
      constructor(...args: unknown[]) {
        super(...entree(args));
        sortie(this);
      }
    },
  }[nom]!;
}

function envelopperMethode(instance: Record<string, unknown>, methode: string, mutant: (origine: Fonction, args: unknown[]) => unknown) {
  const origine = instance[methode];
  if (typeof origine !== 'function') return;
  const liee = (origine as Fonction).bind(instance);
  instance[methode] = (...args: unknown[]) => mutant(liee, args);
}

// --- 6.1 à 6.4, 6.16 : calculerTotal ---------------------------------------------------------

const r2 = (x: number) => Math.round(x * 100) / 100;
const entierPositif = (q: number) => Number.isInteger(q) && q > 0;

/** Chaque mutation ne change le résultat QUE pour les quantités visées ; sinon, ton code répond. */
const MUTANTS_PRIX: Record<string, (p: number, q: number) => number | undefined> = {
  'prix:sans-remise-10': (p, q) => (entierPositif(q) && q >= 10 && q < 50 ? r2(p * q) : undefined),
  'prix:sans-remise-50': (p, q) => (entierPositif(q) && q >= 50 ? r2(p * q * 0.9) : undefined),
  'prix:remise-des-1': (p, q) => (entierPositif(q) && q < 10 ? r2(p * q * 0.9) : undefined),
  'prix:seuil-10-devient-11': (p, q) => (q === 10 ? r2(p * q) : undefined),
  'prix:seuil-10-devient-9': (p, q) => (q === 9 ? r2(p * q * 0.9) : undefined),
  'prix:seuil-50-devient-51': (p, q) => (q === 50 ? r2(p * q * 0.9) : undefined),
  'prix:seuil-50-devient-49': (p, q) => (q === 49 ? r2(p * q * 0.8) : undefined),
  'prix:sans-arrondi': (p, q) => (entierPositif(q) ? p * q * (q >= 50 ? 0.8 : q >= 10 ? 0.9 : 1) : undefined),
  'prix:remise-0-9': (p, q) => (entierPositif(q) && q >= 50 ? r2(p * q * 0.1) : undefined),
  'prix:accepte-zero': (_p, q) => (q === 0 ? 0 : undefined),
  'prix:accepte-negatif': (p, q) => (Number.isInteger(q) && q < 0 ? r2(p * q) : undefined),
  'prix:accepte-decimal': (p, q) => (typeof q === 'number' && q > 0 && !Number.isInteger(q) ? r2(p * q) : undefined),
};

function muterPrix(origine: Fonction, args: unknown[]) {
  const mutant = MUTANTS_PRIX[mutation()];
  const [p, q] = args as [number, number];
  const resultat = mutant?.(Number(p), Number(q));
  return resultat === undefined ? origine(...args) : resultat;
}

if (plan.cibles.prix) {
  const { fichier, export: nom } = plan.cibles.prix;
  vi.doMock(fichier, async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    if (!mutation().startsWith('prix:')) return origine;
    const Base = origine[nom] as Classe;
    return { ...origine, [nom]: envelopperClasse(Base, (a) => a, (i) => envelopperMethode(i, 'calculerTotal', muterPrix)) };
  });
}

// --- 6.5 : transitionner ---------------------------------------------------------------------

function muterTransition(origine: Fonction, args: unknown[]) {
  const [actuel, cible] = args as [string, string];
  const [genre, de, vers] = mutation().split(':').slice(1);
  if (de === actuel && vers === cible) {
    if (genre === 'refuse') throw new Error(`Passage impossible : ${actuel} vers ${cible}`);
    if (genre === 'autorise') return cible;
  }
  return origine(...args);
}

if (plan.cibles.transitions) {
  const { fichier, export: nom, genre } = plan.cibles.transitions;
  vi.doMock(fichier, async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    if (!mutation().startsWith('transition:')) return origine;
    if (genre === 'fonction') {
      const fonction = origine[nom] as Fonction;
      return { ...origine, [nom]: (...args: unknown[]) => muterTransition(fonction, args) };
    }
    return { ...origine, [nom]: envelopperClasse(origine[nom] as Classe, (a) => a, (i) => envelopperMethode(i, 'transitionner', muterTransition)) };
  });
}

// --- 6.6 : ProduitsService, avec ses doublures --------------------------------------------------

const estRequeteInvalide = (e: unknown) => {
  const erreur = e as { getStatus?: () => number; status?: number; constructor?: { name?: string } } | undefined;
  return erreur?.getStatus?.() === 400 || erreur?.status === 400 || erreur?.constructor?.name === 'BadRequestException';
};

/**
 * Les dépendances reçues par le constructeur (tes doublures, ou les vraies) passent par un Proxy qui
 * ne modifie que ce que vise la mutation : la limite lue dans la configuration, ou l'appel à `save`.
 */
function espionnerDependances(args: unknown[]): unknown[] {
  const m = mutation();
  const avecMethode = (nom: string) => args.filter((a) => a && typeof a === 'object' && typeof (a as Record<string, unknown>)[nom] === 'function') as Record<string, Fonction>[];
  return args.map((dep) => {
    if (!dep || typeof dep !== 'object') return dep;
    return new Proxy(dep as object, {
      get(cible, cle) {
        const valeur = Reflect.get(cible, cle, cible) as unknown;
        if (typeof valeur !== 'function') return valeur;
        const fonction = valeur as Fonction;
        if (cle === 'get') {
          return (...a: unknown[]) => {
            const lue = fonction.apply(cible, a);
            if (a[0] !== 'NOMBRE_MAX_PRODUITS') return lue;
            if (m === 'produits:sans-limite') return undefined;
            if (m === 'produits:compte-sans-limite' && (lue === undefined || lue === null)) for (const r of avecMethode('count')) void r.count!();
            return lue;
          };
        }
        if (cle === 'save' && m === 'produits:sans-save') return async (entite: unknown) => entite;
        return (...a: unknown[]) => fonction.apply(cible, a);
      },
    });
  });
}

if (plan.cibles.produits) {
  const { fichier, export: nom } = plan.cibles.produits;
  vi.doMock(fichier, async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    if (!mutation().startsWith('produits:')) return origine;
    const Base = origine[nom] as Classe;
    let deps: unknown[] = [];
    const sortie = (instance: Record<string, unknown>) => {
      if (mutation() !== 'produits:save-malgre-la-limite') return;
      // Quand ton service refuse (400), la mutation enregistre quand même, puis relance l'erreur.
      const enregistrer = () => {
        for (const d of deps) if (d && typeof d === 'object' && typeof (d as Record<string, unknown>).save === 'function') void (d as { save: Fonction }).save({});
      };
      for (const methode of Object.getOwnPropertyNames(Base.prototype)) {
        if (methode === 'constructor') continue;
        envelopperMethode(instance, methode, (origineMethode, args) => {
          try {
            const r = origineMethode(...args);
            if (r && typeof (r as Promise<unknown>).then === 'function') {
              return (r as Promise<unknown>).catch((e: unknown) => {
                if (estRequeteInvalide(e)) enregistrer();
                throw e;
              });
            }
            return r;
          } catch (e) {
            if (estRequeteInvalide(e)) enregistrer();
            throw e;
          }
        });
      }
    };
    const entree = (args: unknown[]) => (deps = espionnerDependances(args));
    return { ...origine, [nom]: envelopperClasse(Base, entree, sortie) };
  });
}

// --- 6.11 : configurerApp qui ne fait plus rien -------------------------------------------------

if (plan.cibles.configurerApp) {
  const { fichier, export: nom } = plan.cibles.configurerApp;
  vi.doMock(fichier, async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    if (mutation() !== 'configurer-app:vide') return origine;
    return { ...origine, [nom]: () => undefined };
  });
}

// --- 6.9, 6.13 : des routes qui mentent (un intercepteur global, ajouté à chaque app.init()) --------

interface Requete {
  method: string;
  url: string;
  originalUrl?: string;
  body?: Record<string, unknown>;
}

const statut = (e: unknown) => (e as { getStatus?: () => number })?.getStatus?.() ?? (e as { status?: number })?.status;

const intercepteur = {
  intercept(contexte: { switchToHttp(): { getRequest(): Requete } }, suite: { handle(): Observable<unknown> }): Observable<unknown> {
    const m = mutation();
    const req = contexte.switchToHttp().getRequest();
    const url = String(req.originalUrl ?? req.url).split('?')[0]!;
    const total = req.method === 'POST' && /\/prix\/total\/?$/.test(url);
    const vendeur = /\/vendeurs\/(\d+)\/?$/.exec(url);
    if (total) {
      if (m === 'http:champ-en-trop-accepte' && req.body) {
        for (const cle of Object.keys(req.body)) if (cle !== 'prixUnitaire' && cle !== 'quantite') delete req.body[cle];
      }
      if (m === 'http:quantite-zero-acceptee' && Number(req.body?.quantite) === 0) return of({ total: 0 });
      if (m === 'http:total-faux') {
        return suite.handle().pipe(map((v) => (v && typeof v === 'object' && typeof (v as { total?: unknown }).total === 'number' ? { ...v, total: (v as { total: number }).total + 1 } : v)));
      }
    }
    if (vendeur) {
      const id = Number(vendeur[1]);
      if (m === 'http:patch-sans-effet' && req.method === 'PATCH') return of({ id });
      if (m === 'http:delete-sans-effet' && req.method === 'DELETE') return of(undefined);
      if (m === 'http:409-masque' && req.method === 'DELETE') {
        return suite.handle().pipe(catchError((e: unknown) => (statut(e) === 409 ? of(undefined) : throwError(() => e))));
      }
      if (m === 'http:404-masque' && req.method === 'GET') {
        return suite.handle().pipe(catchError((e: unknown) => (statut(e) === 404 ? of({ id, nom: 'fantôme' }) : throwError(() => e))));
      }
    }
    return suite.handle();
  },
};

const { NestApplication } = await import('@nestjs/core');
const prototype = NestApplication.prototype as unknown as { init: Fonction; __partie6?: boolean; useGlobalInterceptors: Fonction };
if (!prototype.__partie6) {
  prototype.__partie6 = true;
  const init = prototype.init;
  prototype.init = function (this: typeof prototype, ...args: unknown[]) {
    if (mutation().startsWith('http:')) this.useGlobalInterceptors(intercepteur);
    return init.apply(this, args);
  };
}

// --- 6.14 : le journal des TRUNCATE (et des fichiers qui parlent à la base) ----------------------

const pg = (await import('pg')).default;
const client = pg.Client.prototype as unknown as { query: Fonction; __partie6?: boolean };
if (!client.__partie6) {
  client.__partie6 = true;
  const query = client.query;
  const fichiersVus = new Set<string>();
  client.query = function (this: unknown, config: unknown, ...reste: unknown[]) {
    const texte = typeof config === 'string' ? config : (config as { text?: unknown } | undefined)?.text;
    const { testPath, currentTestName } = expect.getState();
    if (typeof texte === 'string' && testPath) {
      const truncate = /^\s*TRUNCATE\b/i.test(texte);
      if (truncate || !fichiersVus.has(testPath)) {
        fichiersVus.add(testPath);
        appendFileSync(plan.journal, `${JSON.stringify({ fichier: testPath, test: currentTestName ?? null, sql: truncate ? texte : null })}\n`);
      }
    }
    return query.call(this, config, ...reste);
  };
}
