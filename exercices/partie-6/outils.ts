/// <reference types="vite/client" />
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

// Les outils de la partie 6. Ici, ce sont TES tests qu'on vérifie : on copie ton projet dans un dossier
// temporaire, on y lance tes tests avec Vitest (dans un processus à part), puis on les relance en
// introduisant des bugs connus (des « mutations », voir mutations.ts) : un test utile doit tomber.
// Ton dépôt n'est jamais modifié.

const racine = realpathSync(new URL('../..', import.meta.url).pathname);

// --- Trouver ton code (sans imposer d'emplacement quand le cours n'en donne pas) ------------------

const modules: Record<string, () => Promise<unknown>> = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts']);
const sources = import.meta.glob(['../../src/**/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// Les fichiers qu'on ne charge jamais : ils font quelque chose dès qu'on les importe.
const aNePasCharger = (chemin: string) =>
  ['main.ts', 'seed.ts', 'data-source.ts'].some((f) => chemin === `../../src/${f}`) || chemin.startsWith('../../src/migrations/');

/** `../../src/x.ts` → `src/x.ts` */
const cheminRelatif = (chemin: string) => chemin.replace('../../', '');

/** Le contenu de tes fichiers `src/**\/*.spec.ts` (tes tests unitaires). */
export const specsUnitaires = (): Record<string, string> =>
  Object.fromEntries(Object.entries(sources).filter(([c]) => c.endsWith('.spec.ts')).map(([c, s]) => [cheminRelatif(c), s]));

const sourcesE2e = import.meta.glob(['../../test/**/*.e2e-spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Le contenu de tes fichiers `test/**\/*.e2e-spec.ts` (tes tests de bout en bout). */
export const specsE2e = (): Record<string, string> => Object.fromEntries(Object.entries(sourcesE2e).map(([c, s]) => [cheminRelatif(c), s]));

/** Tes fichiers de src/ (hors tests), depuis la racine du dépôt. */
export const fichiersSource = (): string[] => Object.keys(sources).filter((c) => !c.endsWith('.spec.ts')).map(cheminRelatif);

export interface Trouve<T = unknown> {
  /** Le fichier, depuis la racine du dépôt (`src/prix/prix.service.ts`). */
  fichier: string;
  export: string;
  valeur: T;
}

/** Le fichier de src/ qui exporte `nom` (null s'il n'y en a pas). */
export async function localiser<T = unknown>(nom: string): Promise<Trouve<T> | null> {
  for (const [chemin, charger] of Object.entries(modules)) {
    if (aNePasCharger(chemin)) continue;
    let contenu: Record<string, unknown>;
    try {
      contenu = (await charger()) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (nom in contenu) return { fichier: cheminRelatif(chemin), export: nom, valeur: contenu[nom] as T };
  }
  return null;
}

const estClasse = (v: unknown): v is new () => Record<string, unknown> => typeof v === 'function' && /^class\b/.test(Function.prototype.toString.call(v));

export interface Transitions {
  fichier: string;
  export: string;
  genre: 'fonction' | 'classe';
  appeler: (actuel: string, cible: string) => unknown;
}

/** `transitionner(actuel, cible)` : une fonction exportée, ou la méthode d'une classe exportée (6.5). */
export async function localiserTransitions(): Promise<Transitions | null> {
  const fonction = await localiser<(a: string, c: string) => unknown>('transitionner');
  if (fonction && typeof fonction.valeur === 'function') {
    return { fichier: fonction.fichier, export: 'transitionner', genre: 'fonction', appeler: (a, c) => fonction.valeur(a, c) };
  }
  for (const [chemin, charger] of Object.entries(modules)) {
    if (aNePasCharger(chemin) || !sources[chemin]?.includes('transitionner')) continue;
    const contenu = (await charger().catch(() => ({}))) as Record<string, unknown>;
    for (const [nom, valeur] of Object.entries(contenu)) {
      if (!estClasse(valeur)) continue;
      let instance: Record<string, unknown>;
      try {
        instance = new valeur();
      } catch {
        continue;
      }
      if (typeof instance.transitionner === 'function') {
        return { fichier: cheminRelatif(chemin), export: nom, genre: 'classe', appeler: (a, c) => (new valeur().transitionner as (a: string, c: string) => unknown)(a, c) };
      }
    }
  }
  return null;
}

// --- Faire tourner tes tests dans une copie ------------------------------------------------------

export interface ResultatTest {
  nom: string;
  etat: 'passed' | 'failed' | 'skipped' | 'pending';
  erreurs: string[];
}

export interface ResultatModule {
  fichier: string;
  etat: string;
  erreurs: string[];
  tests: ResultatTest[];
}

export interface Ligne {
  fichier: string;
  test: string | null;
  sql: string | null;
}

export interface Execution {
  mutation: string;
  modules: ResultatModule[];
  nonGerees: string[];
  /** Les TRUNCATE exécutés, et le premier accès à la base de chaque fichier (sql: null). */
  journal: Ligne[];
}

export type Genre = 'unitaires' | 'e2e';

export interface Copie {
  dossier: string;
  /**
   * Tes tests (unitaires : src/**\/*.spec.ts ; e2e : test/**\/*.e2e-spec.ts), sans puis avec chaque mutation.
   * `fichiers` (chemins depuis la racine du projet) : n'en lancer que certains.
   */
  executer(genre: Genre, mutations: string[], fichiers?: string[]): Promise<Execution[]>;
  /** Ta configuration de Vitest (vitest.config.unit.ts ou vitest.config.e2e.ts), résolue par Vitest. */
  config(fichier: string): Promise<ConfigVitest | null>;
  /** `npm run test:cov` (ta configuration, avec la couverture) : le résumé par fichier. */
  couverture(): Promise<Couverture>;
  nettoyer(): void;
}

export interface ConfigVitest {
  include: string[];
  fileParallelism: boolean;
  coverage: { include?: string[]; exclude?: string[]; thresholds?: { lines?: number } };
}

export interface ChiffresCouverture {
  lines: { total: number; covered: number; pct: number };
}

export interface Couverture {
  tests: { modules: ResultatModule[] };
  /** Par fichier (`src/...`), plus `total`. */
  resume: Record<string, ChiffresCouverture> | null;
}

export interface Cibles {
  prix?: Trouve | null;
  transitions?: Transitions | null;
  produits?: Trouve | null;
}

/** Pour réutiliser ce harnais dans une autre partie (la partie 8 juge aussi tes tests). */
export interface OptionsCopie {
  /** Le fichier de préparation qui introduit les mutations (par défaut : celui de la partie 6). */
  mutations?: string;
  /** Ajouté au plan que lit ce fichier (les cibles de ses mutations). */
  plan?: Record<string, unknown>;
  /** Des variables d'environnement fournies à tes tests (en plus des DB_* imposées). */
  env?: Record<string, string>;
}

// Les fichiers de ton projet que tes tests peuvent lire.
const A_COPIER = ['src', 'test', 'package.json', 'tsconfig.json', '.env.test', 'vitest.config.unit.ts', 'vitest.config.e2e.ts'];

/**
 * Copie ton projet dans un dossier temporaire (ton dépôt n'est jamais touché), avec les outils de la
 * partie 6 : la préparation des mutations et le pilote qui lance Vitest.
 */
export function preparerCopie(cibles: Cibles = {}, options: OptionsCopie = {}): Copie {
  const dossier = realpathSync(mkdtempSync(join(tmpdir(), 'nestjs-open-partie6-')));
  for (const element of A_COPIER) {
    if (existsSync(join(racine, element))) cpSync(join(racine, element), join(dossier, element), { recursive: true });
  }
  symlinkSync(join(racine, 'node_modules'), join(dossier, 'node_modules'));
  const outils = join(dossier, '.partie6');
  mkdirSync(outils);
  cpSync(join(racine, options.mutations ?? 'exercices/partie-6/mutations.ts'), join(outils, 'mutations.ts'));
  cpSync(join(racine, 'exercices/partie-6/pilote.mjs'), join(outils, 'pilote.mjs'));

  const controle = join(outils, 'mutation.txt');
  const journal = join(outils, 'journal.jsonl');
  writeFileSync(controle, 'aucune');
  const absolu = (fichier: string) => join(dossier, fichier);
  const configurerApp = existsSync(join(dossier, 'src/configurer-app.ts')) ? { fichier: absolu('src/configurer-app.ts'), export: 'configurerApp' } : undefined;
  const plan = {
    ...options.plan,
    controle,
    journal,
    cibles: {
      prix: cibles.prix ? { fichier: absolu(cibles.prix.fichier), export: cibles.prix.export } : undefined,
      transitions: cibles.transitions ? { fichier: absolu(cibles.transitions.fichier), export: cibles.transitions.export, genre: cibles.transitions.genre } : undefined,
      produits: cibles.produits ? { fichier: absolu(cibles.produits.fichier), export: cibles.produits.export } : undefined,
      configurerApp,
    },
  };
  writeFileSync(join(outils, 'plan.json'), JSON.stringify(plan));

  // Nos configurations pour lancer tes tests : celles d'un projet généré (globals…), avec en plus la
  // préparation des mutations. Ta propre configuration n'est lue que pour 6.14 à 6.16.
  for (const genre of ['unitaires', 'e2e'] as const) {
    const include = genre === 'unitaires' ? 'src/**/*.spec.ts' : 'test/**/*.e2e-spec.ts';
    writeFileSync(
      join(outils, `vitest.${genre}.config.mjs`),
      `import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    root: ${JSON.stringify(dossier)},
    include: [${JSON.stringify(include)}],
    exclude: ['node_modules/**', '.partie6/**'],
    setupFiles: [${JSON.stringify(join(outils, 'mutations.ts'))}],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
`,
    );
  }

  let numero = 0;
  const piloter = async <T>(demande: Record<string, unknown>): Promise<T> => {
    numero++;
    const fichierDemande = join(outils, `demande-${numero}.json`);
    const sortie = join(outils, `sortie-${numero}.json`);
    writeFileSync(fichierDemande, JSON.stringify({ racine: dossier, controle, journal, sortie, ...demande }));
    // Un environnement propre : ni les variables de ce Vitest-ci, ni celles que les tests des parties
    // 3 à 5 fournissent (tes tests doivent trouver les leurs dans .env.test). Seule la base (DB_*) est
    // imposée, pour viser la base de test de ce dépôt.
    const env: NodeJS.ProcessEnv = { ...process.env, P6_PLAN: join(outils, 'plan.json') };
    for (const cle of Object.keys(env)) if (/^VITEST|^TEST$/.test(cle)) delete env[cle];
    for (const cle of ['NOMBRE_MAX_PRODUITS', 'NOMBRE_MAX_JOUEURS', 'PORT']) delete env[cle];
    Object.assign(env, options.env);
    // Comme la commande `vitest` : NODE_ENV=test (c'est ce qui fait lire .env.test à ton application).
    env.NODE_ENV = 'test';
    // Un test unitaire n'a pas besoin de la base : pendant les tiens, elle est injoignable.
    if (demande.genre === 'unitaires') Object.assign(env, { DB_HOST: '127.0.0.1', DB_PORT: '9' });
    const journalProcessus: string[] = [];
    const code = await new Promise<number | null>((resoudre) => {
      const enfant = spawn(process.execPath, [join(outils, 'pilote.mjs'), fichierDemande], { cwd: dossier, env, stdio: ['ignore', 'pipe', 'pipe'] });
      enfant.stdout.on('data', (d: Buffer) => journalProcessus.push(d.toString()));
      enfant.stderr.on('data', (d: Buffer) => journalProcessus.push(d.toString()));
      enfant.on('close', resoudre);
    });
    if (!existsSync(sortie)) throw new Error(`Impossible de lancer tes tests (code ${code}) :\n${journalProcessus.join('').slice(-3000)}`);
    const resultat = JSON.parse(readFileSync(sortie, 'utf8')) as T & { erreur?: string };
    if (resultat.erreur?.includes('No test files found')) {
      throw new Error('Aucun fichier de test trouvé : écris tes tests unitaires dans src/, à côté du code (`*.spec.ts`), et garde `include: [\'src/**/*.spec.ts\']` dans vitest.config.unit.ts.');
    }
    if (resultat.erreur) throw new Error(`Vitest n'a pas pu lancer tes tests : ${resultat.erreur.slice(0, 3000)}`);
    return resultat;
  };

  return {
    dossier,
    async executer(genre, mutations, fichiers) {
      const { executions } = await piloter<{ executions: Execution[] }>({ mode: 'executer', genre, config: join(outils, `vitest.${genre}.config.mjs`), mutations, fichiers });
      return executions;
    },
    async config(fichier) {
      const { config } = await piloter<{ config: ConfigVitest | null }>({ mode: 'config', config: join(dossier, fichier) });
      return config;
    },
    async couverture() {
      const rapport = join(outils, 'couverture');
      const { tests, resume } = await piloter<{ tests: Couverture['tests']; resume: Record<string, ChiffresCouverture> | null }>({
        mode: 'couverture',
        config: join(dossier, 'vitest.config.unit.ts'),
        dossier: rapport,
      });
      const parFichier = resume ? Object.fromEntries(Object.entries(resume).map(([f, c]) => [f === 'total' ? f : relative(dossier, f), c])) : null;
      return { tests, resume: parFichier };
    },
    nettoyer() {
      rmSync(dossier, { recursive: true, force: true });
    },
  };
}

// --- Lire les résultats --------------------------------------------------------------------------

const tousLesTests = (e: Pick<Execution, 'modules'>) => e.modules.flatMap((m) => m.tests.map((t) => ({ ...t, fichier: m.fichier })));

/** Ce qui ne va pas quand tes tests tournent SANS mutation (liste vide : tout est vert). */
export function problemesSansMutation(e: Pick<Execution, 'modules' | 'nonGerees'>, quoi: string): string[] {
  const problemes: string[] = [];
  if (e.modules.length === 0) problemes.push(`aucun fichier de test trouvé (${quoi})`);
  for (const m of e.modules) {
    if (m.erreurs.length > 0) problemes.push(`${m.fichier} ne se charge pas : ${m.erreurs[0]!.split('\n')[0]}`);
    if (m.tests.length === 0 && m.erreurs.length === 0) problemes.push(`${m.fichier} ne contient aucun test`);
  }
  for (const t of tousLesTests(e)) {
    if (t.etat === 'failed') problemes.push(`${t.fichier} › ${t.nom} échoue : ${t.erreurs[0]?.split('\n')[0] ?? ''}`);
  }
  for (const n of e.nonGerees) problemes.push(`erreur non gérée : ${n.split('\n')[0]}`);
  return problemes;
}

/** Les tests qui échouent sous cette mutation (un test en échec = la mutation est « attrapée »). */
export const testsTombes = (e: Execution): string[] => tousLesTests(e).filter((t) => t.etat === 'failed').map((t) => `${t.fichier} › ${t.nom}`);

export const nombreDeTests = (e: Pick<Execution, 'modules'>): number => tousLesTests(e).length;

/** Toutes les exécutions, indexées par mutation. */
export const parMutation = (executions: Execution[]): Record<string, Execution> => Object.fromEntries(executions.map((e) => [e.mutation, e]));

/**
 * Le cadre commun des tests de la partie 6 : si tes tests ne passent pas sans mutation, inutile de
 * juger les mutations. Lève une erreur claire.
 */
export function exigerVert(sans: Execution | undefined, quoi: string, indice: string): void {
  if (!sans) throw new Error(`Tes tests n'ont pas pu être lancés. ${indice}`);
  const problemes = problemesSansMutation(sans, quoi);
  if (problemes.length > 0) {
    throw new Error(`Tes tests (${quoi}) doivent d'abord passer, sur ton code tel quel. ${indice}\n  - ${problemes.slice(0, 8).join('\n  - ')}`);
  }
}

/** Au moins un de tes fichiers de test parle de `mot` (sinon : l'indice). */
export function exigerMention(specs: Record<string, string>, mot: string, quoi: string, indice: string): void {
  if (!Object.values(specs).some((s) => s.includes(mot))) throw new Error(`Aucun de tes fichiers ${quoi} ne parle de \`${mot}\`. ${indice}`);
}

/** La mutation doit faire échouer au moins un de tes tests. */
export function exigerDetection(executions: Record<string, Execution>, mutation: string, description: string): void {
  const execution = executions[mutation];
  if (!execution) throw new Error(`La mutation ${mutation} n'a pas pu être lancée.`);
  if (testsTombes(execution).length === 0) {
    throw new Error(`Bug non détecté : ${description}. Avec ce bug introduit dans ton code, tous tes tests restent verts : ajoute (ou corrige) le test qui l'attrape.`);
  }
}
