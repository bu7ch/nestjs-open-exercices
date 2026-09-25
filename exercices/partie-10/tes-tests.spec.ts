import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { SECRET, SECRET_REFRESH } from '../partie-7/outils.js';
import { exigerVert, parMutation, preparerCopie, specsE2e, specsUnitaires, testsTombes, type Copie, type Execution } from '../partie-6/outils.js';
import { cartographier, exportDe, exportNomme, trouverRoute, type Carte } from '../partie-8/outils.js';
import { ENV_REDIS, racine, verifierRedisJoignable, viderRedis } from './outils.js';

// Les exercices où le cours te fait écrire des tests précis sont jugés comme en parties 6, 8 et 9 : ton
// projet est copié dans un dossier temporaire, tes tests y tournent, puis ils sont relancés avec un bug
// introduit exprès dans ton code (voir mutations.ts) : au moins un de tes tests doit tomber.
//  - 10.1 : ton test de `validerEnvironnement` (src/**/*.spec.ts qui en parle) ;
//  - 10.8 : ton fichier des abus (et tout fichier e2e qui réactive la limitation) passe DEUX FOIS DE SUITE
//    (les compteurs survivent dans Redis : `flushdb()` avant chaque test) ;
//  - 10.10 : ton test/sante.e2e-spec.ts (les fichiers e2e qui parlent de `/sante/pret`) ;
//  - 10.11 : ton src/journal.spec.ts (les fichiers qui parlent de `creerLogger`) ;
//  - 10.15 : ton test/proxy.e2e-spec.ts (les fichiers e2e qui parlent de `X-Forwarded-For`).
// La correction du test du 8.5 (10.11) n'est pas jugée : fais-la, et regarde-le échouer avant.

type Cible = { fichier: string; export: string };

const INDICE_UNITAIRES = 'Écris tes tests unitaires dans src/, à côté du code (`*.spec.ts`), comme en partie 6.';
const INDICE_E2E = 'Écris tes tests de bout en bout dans test/ (`*.e2e-spec.ts`), comme en partie 6.';

const MUTATIONS_ENV: Record<string, string> = {
  'env:sans-conversion': 'les nombres ne sont plus convertis : `NOMBRE_MAX_PRODUITS: \'50\'` reste la chaîne \'50\' (vérifie qu\'il devient le nombre 50)',
  'env:db-host-facultatif': 'DB_HOST n\'est plus obligatoire (vérifie qu\'un environnement sans DB_HOST lève une erreur qui contient `DB_HOST`)',
  'env:node-env-libre': 'NODE_ENV accepte `prod` (vérifie le refus, avec `NODE_ENV (isIn)`)',
};

const MUTATIONS_JOURNAL: Record<string, string> = {
  'journal:texte-en-production': 'en production, le logger écrit du texte (vérifie que la ligne se lit avec `JSON.parse`)',
  'journal:sans-params': 'les paramètres ne sont plus écrits (vérifie `params` dans la ligne JSON)',
  'journal:sans-contexte': 'le contexte n\'est plus écrit (vérifie `context: \'HTTP\'` dans la ligne JSON)',
  'journal:debug-en-production': 'en production, debug et verbose sont écrits (vérifie qu\'ils n\'écrivent rien)',
  'journal:json-en-developpement': 'en développement, le logger écrit du JSON (vérifie que la ligne n\'est pas du JSON)',
};

const MUTATIONS_SANTE: Record<string, string> = {
  'sante:pret-toujours-200': '/sante/pret répond 200 même base coupée (vérifie le 503 après `destroy()`)',
  'sante:sans-detail': 'la 503 perd le rapport de Terminus (vérifie `error.base.status` à `down`)',
  'sante:vivant-verifie-la-base': '/sante vérifie la base et tombe avec elle (vérifie que /sante reste à 200 après `destroy()`)',
  'sante:identifiee': '/sante/pret reçoit un X-Request-Id (vérifie que l\'en-tête est absent)',
};

const MUTATION_PROXY = 'proxy:sans-trust-proxy';
const DESCRIPTION_PROXY = '`trust proxy` est coupé : tous les clients partagent un compteur (vérifie qu\'une autre adresse, 203.0.113.2, reçoit encore 401)';

/** Les variables que tes tests trouvent d'habitude dans ton .env.test : on ne fournit que celles qui y manquent. */
function variablesManquantes(): Record<string, string> {
  const fichier = `${racine}/.env.test`;
  const tiennes = existsSync(fichier) ? parseEnv(readFileSync(fichier, 'utf8')) : {};
  const nos = { NOMBRE_MAX_PRODUITS: '1000', JWT_SECRET: SECRET, JWT_REFRESH_SECRET: SECRET_REFRESH, THROTTLE_ACTIF: 'false' };
  // REDIS_HOST et REDIS_PORT sont imposés (comme DB_*) : ceux du Redis des tests.
  return { ...Object.fromEntries(Object.entries(nos).filter(([cle]) => tiennes[cle] === undefined)), ...ENV_REDIS };
}

/** Les cibles des mutations, retrouvées dans ton code (null : pas encore écrit). */
function cibles(carte: Carte) {
  const nommee = (nom: string): Cible | undefined => {
    const e = exportNomme(carte, nom);
    return e ? { fichier: e.fichier, export: e.nom } : undefined;
  };
  let sante: (Cible & { pret: string; vivant?: string }) | undefined;
  const pret = trouverRoute(carte, 'GET', 'sante/pret');
  const e = pret && exportDe(carte, pret.controleur);
  if (pret && e) {
    const nomDe = (handler: Function | undefined) => Object.getOwnPropertyNames(pret.controleur.prototype).find((n) => (pret.controleur.prototype as Record<string, unknown>)[n] === handler);
    const vivant = trouverRoute(carte, 'GET', 'sante');
    const pretNom = nomDe(pret.handler);
    if (pretNom) sante = { fichier: e.fichier, export: e.nom, pret: pretNom, vivant: vivant?.controleur === pret.controleur ? nomDe(vivant.handler) : undefined };
  }
  const appModule = carte.exports.find((x) => x.fichier === 'src/app.module.ts' && x.nom === 'AppModule');
  return {
    env: nommee('validerEnvironnement'),
    journal: nommee('creerLogger'),
    sante,
    appModule: appModule ? { fichier: appModule.fichier, export: appModule.nom } : undefined,
  };
}

/** La mutation doit faire tomber au moins un test, parmi CES fichiers. */
function exigerDetection(executions: Record<string, Execution>, mutation: string, description: string): void {
  const execution = executions[mutation];
  if (!execution) throw new Error(`La mutation ${mutation} n'a pas pu être lancée.`);
  if (testsTombes(execution).length === 0) {
    throw new Error(`Bug non détecté : ${description}. Avec ce bug introduit dans ton code, tous tes tests restent verts : ajoute (ou corrige) le test qui l'attrape.`);
  }
}

const fichiersQui = (specs: Record<string, string>, motif: RegExp) => Object.entries(specs).filter(([, s]) => motif.test(s)).map(([f]) => f);

describe('Partie 10 · Tes tests, jugés par mutation (exercices 10.1, 10.8, 10.10, 10.11, 10.15)', () => {
  let copie: Copie | undefined;
  let trouvees: ReturnType<typeof cibles> | undefined;
  const resultats: Record<string, { executions?: Record<string, Execution>; echec?: unknown; fichiers: string[] }> = {};

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      await verifierRedisJoignable();
      trouvees = cibles(await cartographier());
      const plan = { cibles10: Object.fromEntries(Object.entries(trouvees).filter(([, c]) => c)) };
      copie = preparerCopie({}, { mutations: 'exercices/partie-10/mutations.ts', plan, env: variablesManquantes() });

      const unitaires = specsUnitaires();
      const e2e = specsE2e();
      const lots: Record<string, { genre: 'unitaires' | 'e2e'; fichiers: string[]; mutations: string[] }> = {
        env: { genre: 'unitaires', fichiers: fichiersQui(unitaires, /\bvaliderEnvironnement\b/), mutations: trouvees.env ? Object.keys(MUTATIONS_ENV) : [] },
        journal: { genre: 'unitaires', fichiers: fichiersQui(unitaires, /\bcreerLogger\b/), mutations: trouvees.journal ? Object.keys(MUTATIONS_JOURNAL) : [] },
        // Deux fois de suite, sans rien changer : les compteurs de la première fois sont encore dans Redis.
        abus: { genre: 'e2e', fichiers: fichiersQui(e2e, /THROTTLE_ACTIF\s*=\s*['"`]true['"`]/), mutations: ['relance'] },
        sante: { genre: 'e2e', fichiers: fichiersQui(e2e, /\/sante\/pret/), mutations: trouvees.sante ? Object.keys(MUTATIONS_SANTE) : [] },
        proxy: { genre: 'e2e', fichiers: fichiersQui(e2e, /x-forwarded-for/i), mutations: [MUTATION_PROXY] },
      };
      for (const [nom, lot] of Object.entries(lots)) {
        resultats[nom] = { fichiers: lot.fichiers };
        if (lot.fichiers.length === 0) continue;
        try {
          if (nom === 'abus') {
            // Un fichier à la fois : un autre fichier qui viderait Redis masquerait l'oubli de celui-ci.
            const parFichier: Execution[] = [];
            for (const fichier of lot.fichiers) {
              await viderRedis();
              const [premiere, seconde] = await copie.executer('e2e', ['aucune', 'relance'], [fichier]);
              parFichier.push(premiere!, seconde!);
            }
            const fusion = (m: string): Execution => ({ mutation: m, modules: parFichier.filter((e) => e.mutation === m).flatMap((e) => e.modules), nonGerees: parFichier.filter((e) => e.mutation === m).flatMap((e) => e.nonGerees), journal: [] });
            resultats[nom]!.executions = { aucune: fusion('aucune'), relance: fusion('relance') };
            continue;
          }
          // Chaque lot part d'un Redis vide (les compteurs des tests précédents n'y sont plus).
          if (lot.genre === 'e2e') await viderRedis();
          resultats[nom]!.executions = parMutation(await copie.executer(lot.genre, ['aucune', ...lot.mutations], lot.fichiers));
        } catch (erreur) {
          resultats[nom]!.echec = erreur;
        }
      }
    } catch (erreur) {
      echec = erreur;
    }
  }, 900_000);
  afterAll(async () => {
    copie?.nettoyer();
    await viderRedis().catch(() => undefined);
  });

  /** Les résultats d'un lot, après avoir vérifié que tes tests passent sans mutation. */
  function lot(nom: string, absent: string, indice: string): Record<string, Execution> {
    const r = resultats[nom]!;
    if (r.fichiers.length === 0) throw new Error(absent);
    if (r.echec) throw r.echec;
    exigerVert(r.executions?.aucune, r.fichiers.join(', '), indice);
    return r.executions!;
  }

  describe('10.1 · ton test de la validation d\'environnement', () => {
    const exiger = () => {
      if (!trouvees?.env) throw new Error('Aucun fichier de src/ n\'exporte `validerEnvironnement` (exercices 4.13 et 10.1).');
      return lot('env', 'Aucun de tes tests unitaires ne parle de `validerEnvironnement` : écris src/config/variables-environnement.spec.ts (exercice 10.1), sans oublier `import \'reflect-metadata\';` en première ligne.', INDICE_UNITAIRES);
    };
    for (const [mutation, description] of Object.entries(MUTATIONS_ENV)) {
      it(`bug attrapé : ${description.split(' (')[0]}`, () => exigerDetection(exiger(), mutation, description));
    }
  });

  describe('10.8 · ton fichier des abus vide Redis avant chaque test', () => {
    it('lancé deux fois de suite, il passe les deux fois', () => {
      const executions = lot(
        'abus',
        'Aucun de tes tests e2e ne réactive la limitation (`process.env.THROTTLE_ACTIF = \'true\'`) : garde ton fichier des abus de l\'exercice 7.18.',
        INDICE_E2E,
      );
      const seconde = executions.relance!;
      const tombes = testsTombes(seconde);
      if (tombes.length > 0) {
        throw new Error(
          `Relancés aussitôt, ces tests échouent (les compteurs de la première fois sont encore dans Redis) : ajoute \`beforeEach(async () => { await app.get<Redis>(REDIS).flushdb(); })\` (exercice 10.8).\n  - ${tombes.slice(0, 5).join('\n  - ')}`,
        );
      }
    });
  });

  describe('10.10 · ton test de la santé (e2e)', () => {
    const exiger = () => {
      if (!trouvees?.sante) throw new Error('Aucune route `GET /sante/pret` trouvée dans tes contrôleurs (exercice 10.10).');
      return lot('sante', 'Aucun de tes tests e2e ne parle de `/sante/pret` : écris test/sante.e2e-spec.ts (exercice 10.10).', INDICE_E2E);
    };
    for (const [mutation, description] of Object.entries(MUTATIONS_SANTE)) {
      it(`bug attrapé : ${description.split(' (')[0]}`, () => {
        if (mutation === 'sante:vivant-verifie-la-base' && !trouvees?.sante?.vivant) throw new Error('`GET /sante` et `GET /sante/pret` doivent être dans le même contrôleur (SanteController, exercice 10.10).');
        exigerDetection(exiger(), mutation, description);
      });
    }
  });

  describe('10.11 · ton test du logger', () => {
    const exiger = () => {
      if (!trouvees?.journal) throw new Error('Aucun fichier de src/ n\'exporte `creerLogger` (exercice 10.11).');
      return lot('journal', 'Aucun de tes tests unitaires ne parle de `creerLogger` : écris src/journal.spec.ts (exercice 10.11).', INDICE_UNITAIRES);
    };
    for (const [mutation, description] of Object.entries(MUTATIONS_JOURNAL)) {
      it(`bug attrapé : ${description.split(' (')[0]}`, () => exigerDetection(exiger(), mutation, description));
    }
  });

  describe('10.15 · ton test derrière un proxy (e2e)', () => {
    it(`bug attrapé : ${DESCRIPTION_PROXY.split(' (')[0]}`, () => {
      const executions = lot('proxy', 'Aucun de tes tests e2e ne parle de `X-Forwarded-For` : écris test/proxy.e2e-spec.ts (exercice 10.15).', INDICE_E2E);
      exigerDetection(executions, MUTATION_PROXY, DESCRIPTION_PROXY);
    });
  });
});
