// Fichier de préparation (setupFiles) chargé AVANT chacun de TES fichiers de test, quand les tests de
// la partie 8 font tourner tes tests dans une copie temporaire de ton projet (jamais dans ton dépôt),
// comme en partie 6 (voir exercices/partie-6/mutations.ts).
//
// Il introduit, à la demande, une « mutation » : un bug précis dans ton middleware, ton guard de statut,
// ton interceptor de champ interne ou ton filtre d'exceptions. Un bon test doit alors ÉCHOUER. Ton code
// n'est jamais réécrit : la mutation enveloppe ta classe (une sous-classe de même nom, que NestJS
// construit avec les mêmes dépendances) et ne change son comportement QUE sur le cas visé.
import { BadRequestException, ForbiddenException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { map, type Observable } from 'rxjs';
import { vi } from 'vitest';

interface Cible {
  fichier: string;
  export: string;
  /** La clé de métadonnée de `@StatutRequis` (guard de statut). */
  cle?: string;
}

interface Plan {
  controle: string;
  cibles8: { middleware?: Cible; filtre?: Cible; statut?: Cible; interne?: Cible };
}

const plan = JSON.parse(readFileSync(process.env.P6_PLAN!, 'utf8')) as Plan;
// Les fichiers visés sont donnés depuis la racine de la copie (le plan est dans <copie>/.partie6/).
const racine = dirname(dirname(process.env.P6_PLAN!));
const absolu = (fichier: string) => (isAbsolute(fichier) ? fichier : join(racine, fichier));
const mutation = (): string => readFileSync(plan.controle, 'utf8').trim();

type Fonction = (...args: unknown[]) => unknown;
type Classe = new (...args: unknown[]) => Record<string, unknown>;

/** Une sous-classe de même nom : NestJS l'injecte comme l'originale ; `sortie` enveloppe l'instance. */
function envelopperClasse(Base: Classe, entree: (args: unknown[]) => void, sortie: (instance: Record<string, unknown>) => void): Classe {
  const nom = Base.name;
  return {
    [nom]: class extends Base {
      constructor(...args: unknown[]) {
        entree(args);
        super(...args);
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

function remplacerExport(cible: Cible | undefined, prefixe: string, entree: (args: unknown[]) => void, sortie: (instance: Record<string, unknown>) => void) {
  if (!cible) return;
  vi.doMock(absolu(cible.fichier), async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    if (!mutation().startsWith(prefixe)) return origine;
    return { ...origine, [cible.export]: envelopperClasse(origine[cible.export] as Classe, entree, sortie) };
  });
}

const statutDe = (e: unknown): number | undefined => (e as { getStatus?: () => number })?.getStatus?.() ?? (e as { status?: number })?.status;

/** Appelle `f` ; si elle échoue (tout de suite ou plus tard), passe l'erreur à `siErreur`. */
function surErreur(f: () => unknown, siErreur: (e: unknown) => unknown): unknown {
  try {
    const r = f();
    return r && typeof (r as Promise<unknown>).then === 'function' ? (r as Promise<unknown>).catch(siErreur) : r;
  } catch (e) {
    return siErreur(e);
  }
}

// --- 8.4 : RequeteIdMiddleware ----------------------------------------------------------------

interface Requete {
  headers: Record<string, unknown>;
  requeteId?: string;
  [cle: string]: unknown;
}
interface Reponse {
  setHeader(nom: string, valeur: string): void;
  removeHeader(nom: string): void;
}

remplacerExport(plan.cibles8.middleware, 'middleware:', () => undefined, (instance) =>
  envelopperMethode(instance, 'use', (origine, args) => {
    const [requete, reponse, suivant] = args as [Requete, Reponse, (...a: unknown[]) => void];
    const recu = requete.headers['x-request-id'];
    const m = mutation();
    // L'identifiant du client est ignoré, même valide.
    if (m === 'middleware:ignore-le-client') delete requete.headers['x-request-id'];
    const suite = (...a: unknown[]) => {
      // Un identifiant douteux est repris tel quel.
      if (m === 'middleware:accepte-le-douteux' && typeof recu === 'string') {
        reponse.setHeader('X-Request-Id', recu);
        requete.requeteId = recu;
      }
      // Sans identifiant du client, aucun n'est généré.
      if (m === 'middleware:ne-genere-rien' && recu === undefined) reponse.removeHeader('X-Request-Id');
      suivant(...a);
    };
    return origine(requete, reponse, suite, ...args.slice(3));
  }),
);

// --- 8.10 : le guard de statut ------------------------------------------------------------------

interface Contexte {
  getHandler?: () => unknown;
  getClass?: () => unknown;
}

let dependancesDuGuard: unknown[] = [];

remplacerExport(
  plan.cibles8.statut,
  'statut:',
  (args) => (dependancesDuGuard = args),
  (instance) =>
    envelopperMethode(instance, 'canActivate', (origine, args) => {
      const m = mutation();
      const [contexte] = args as [Contexte];
      const cle = plan.cibles8.statut?.cle;
      // Une route SANS @StatutRequis est refusée.
      if (m === 'statut:route-libre-refusee' && cle) {
        let handler: unknown;
        let classe: unknown;
        try {
          handler = contexte.getHandler?.();
          classe = contexte.getClass?.();
        } catch {
          /* un faux contexte incomplet */
        }
        const decore = [handler, classe].some((c) => c && Reflect.getMetadata(cle, c as object) !== undefined);
        if (!decore) throw new ForbiddenException('Action impossible');
      }
      return surErreur(
        () => origine(...args),
        (e) => {
          const statut = statutDe(e);
          // Le refus (403) laisse passer.
          if (m === 'statut:refus-ignore' && statut === 403) return true;
          // Le refus ne dit plus quel est le statut actuel.
          if (m === 'statut:message-muet' && statut === 403) throw new ForbiddenException('Action impossible');
          // Une commande introuvable (404) laisse passer.
          if (m === 'statut:introuvable-passe' && statut === 404) return true;
          // Un identifiant absurde part en base (NaN), puis finit en 404.
          if (m === 'statut:id-en-base' && (statut === 400 || e instanceof BadRequestException)) {
            for (const dependance of dependancesDuGuard) {
              if (!dependance || typeof dependance !== 'object' || dependance.constructor?.name === 'Reflector') continue;
              for (const valeur of Object.values(dependance)) {
                if (typeof valeur !== 'function') continue;
                try {
                  const r = (valeur as Fonction).call(dependance, Number.NaN);
                  if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(() => undefined);
                } catch {
                  /* peu importe : l'appel a eu lieu */
                }
              }
            }
            throw new NotFoundException('Commande NaN introuvable');
          }
          throw e;
        },
      );
    }),
);

// --- 8.11 : l'interceptor du champ interne ------------------------------------------------------

const INCONNU = { id: -987_654, sub: -987_654, role: 'acheteur', email: 'inconnu@exemple.fr' };

/** Le même contexte, mais la requête est celle d'un inconnu (ni propriétaire, ni admin). */
function contexteDInconnu(contexte: Record<string, unknown>): unknown {
  return new Proxy(contexte, {
    get(cible, cle) {
      const valeur = Reflect.get(cible, cle, cible) as unknown;
      if (cle !== 'switchToHttp' || typeof valeur !== 'function') return valeur;
      return () => {
        const http = (valeur as Fonction).call(cible) as Record<string, unknown>;
        return new Proxy(http, {
          get(h, k) {
            const v = Reflect.get(h, k, h) as unknown;
            if (k !== 'getRequest' || typeof v !== 'function') return v;
            return () => ({ ...((v as Fonction).call(h) as object), compte: INCONNU, user: INCONNU, utilisateur: INCONNU });
          },
        });
      };
    },
  });
}

/** Retire de `origine` (en place) ce que l'interceptor a masqué dans `sortie`. */
function modifierOrigine(origine: unknown, sortie: unknown) {
  if (Array.isArray(origine)) {
    origine.forEach((o, i) => modifierOrigine(o, Array.isArray(sortie) ? sortie[i] : undefined));
    return;
  }
  if (!origine || typeof origine !== 'object') return;
  for (const cle of Object.keys(origine)) {
    const avant = (origine as Record<string, unknown>)[cle];
    const apres = sortie && typeof sortie === 'object' ? (sortie as Record<string, unknown>)[cle] : undefined;
    if (avant !== undefined && avant !== null && (apres === undefined || apres === null)) delete (origine as Record<string, unknown>)[cle];
  }
}

remplacerExport(plan.cibles8.interne, 'interne:', () => undefined, (instance) =>
  envelopperMethode(instance, 'intercept', (origine, args) => {
    const m = mutation();
    const [contexte, suivant] = args as [Record<string, unknown>, { handle(): Observable<unknown> }];
    // Plus rien n'est masqué.
    if (m === 'interne:rien-masque') return suivant.handle();
    // Masqué pour tout le monde, propriétaire compris.
    if (m === 'interne:tout-masque') return origine(contexteDInconnu(contexte), suivant, ...args.slice(2));
    // La réponse d'origine est modifiée (le champ supprimé en place).
    if (m === 'interne:origine-modifiee') {
      let vue: unknown;
      const espion = { handle: () => suivant.handle().pipe(map((v) => ((vue = v), v))) };
      const flux = origine(contexte, espion, ...args.slice(2)) as Observable<unknown>;
      return flux.pipe(
        map((sortie) => {
          modifierOrigine(vue, sortie);
          return sortie;
        }),
      );
    }
    return origine(...args);
  }),
);

// --- 8.14 à 8.16 : ToutesExceptionsFilter ---------------------------------------------------------

const ressembleAUnLogger = (v: unknown): v is { error: Fonction } => v instanceof Logger || (!!v && typeof v === 'object' && typeof (v as { error?: unknown }).error === 'function' && typeof (v as { log?: unknown }).log === 'function');
const SILENCIEUX = { log() {}, error() {}, warn() {}, debug() {}, verbose() {}, fatal() {} };

interface Hote {
  switchToHttp(): { getResponse(): { status(code: number): { json(corps: unknown): unknown } } };
}

/** Le même hôte, mais le corps envoyé passe d'abord par `modifier`. */
function hoteModifie(hote: Hote, modifier: (corps: Record<string, unknown>, statut: number) => Record<string, unknown>): Hote {
  return new Proxy(hote as unknown as Record<string, unknown>, {
    get(cible, cle) {
      const valeur = Reflect.get(cible, cle, cible) as unknown;
      if (cle !== 'switchToHttp' || typeof valeur !== 'function') return valeur;
      return () => {
        const http = (valeur as Fonction).call(cible) as Record<string, unknown>;
        return new Proxy(http, {
          get(h, k) {
            const v = Reflect.get(h, k, h) as unknown;
            if (k !== 'getResponse' || typeof v !== 'function') return v;
            return () => {
              const reponse = (v as Fonction).call(h) as Record<string, unknown>;
              return new Proxy(reponse, {
                get(r, kr) {
                  const s = Reflect.get(r, kr, r) as unknown;
                  if (kr !== 'status' || typeof s !== 'function') return typeof s === 'function' ? (s as Fonction).bind(r) : s;
                  return (code: number) => {
                    const suite = (s as Fonction).call(r, code) as Record<string, unknown>;
                    return new Proxy(suite, {
                      get(x, kx) {
                        const j = Reflect.get(x, kx, x) as unknown;
                        if (kx !== 'json' || typeof j !== 'function') return typeof j === 'function' ? (j as Fonction).bind(x) : j;
                        return (corps: unknown) => (j as Fonction).call(x, corps && typeof corps === 'object' ? modifier({ ...(corps as object) } as Record<string, unknown>, code) : corps);
                      },
                    });
                  };
                },
              });
            };
          },
        });
      };
    },
  }) as unknown as Hote;
}

remplacerExport(plan.cibles8.filtre, 'filtre:', () => undefined, (instance) =>
  envelopperMethode(instance, 'catch', (origine, args) => {
    const m = mutation();
    const [exception, hote] = args as [unknown, Hote];
    const loggers = Object.keys(instance).filter((k) => ressembleAUnLogger(instance[k]));
    // Une erreur inattendue (500) révèle son message (et sa pile) au client.
    if (m === 'filtre:secret-revele') {
      const detail = exception instanceof Error ? `${exception.message} ${exception.stack ?? ''}` : String(exception);
      return origine(exception, hoteModifie(hote, (corps, statut) => (statut >= 500 ? { ...corps, message: detail } : corps)), ...args.slice(2));
    }
    // Les erreurs 500 ne sont plus journalisées.
    if (m === 'filtre:500-non-journalisee') {
      const originaux = loggers.map((k) => [k, instance[k]] as const);
      for (const [k] of originaux) instance[k] = SILENCIEUX;
      try {
        return origine(...args);
      } finally {
        for (const [k, v] of originaux) instance[k] = v;
      }
    }
    // Les erreurs du client (4xx) sont journalisées comme des incidents.
    if (m === 'filtre:4xx-journalisee') {
      const resultat = origine(...args);
      const statut = exception instanceof HttpException ? exception.getStatus() : undefined;
      if (statut !== undefined && statut < 500) for (const k of loggers) (instance[k] as { error: Fonction }).error(`erreur du client ${statut}`);
      return resultat;
    }
    // La réponse d'erreur perd l'identifiant de la requête.
    if (m === 'filtre:sans-requeteId') {
      return origine(exception, hoteModifie(hote, ({ requeteId: _requeteId, ...corps }) => corps), ...args.slice(2));
    }
    // Le tableau des règles violées devient une seule chaîne.
    if (m === 'filtre:message-aplati') {
      return origine(exception, hoteModifie(hote, (corps) => (Array.isArray(corps.message) ? { ...corps, message: corps.message.join(', ') } : corps)), ...args.slice(2));
    }
    return origine(...args);
  }),
);
