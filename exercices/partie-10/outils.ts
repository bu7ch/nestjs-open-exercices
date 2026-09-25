/// <reference types="vite/client" />
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Redis } from 'ioredis';
import { parse as parseYaml } from 'yaml';
import { rechargerLeCode, trouverExport } from '../aide.js';
import type { AppAvecBase, OptionsBase } from '../partie-5/outils.js';
import { ENV_AUTH, lancerAvecAuth } from '../partie-7/outils.js';

// Les outils de la partie 10. Trois façons de vérifier tes exercices :
//  1. ton application, démarrée par les tests comme dans les parties 7 à 9 (avec leurs secrets, la base
//     de test ET le Redis des tests : REDIS_HOST/REDIS_PORT, fixés dans vitest.config.ts) ;
//  2. ton application COMPILÉE (`nest build` dans un dossier temporaire), lancée comme en production :
//     `node dist/main.js`, dans un processus à part, sans aucun fichier .env ;
//  3. tes fichiers de déploiement (Dockerfile, .dockerignore, compose.yaml, compose.prod.yaml, le workflow
//     GitHub Actions), lus et analysés sans rien exécuter. Docker lui-même n'est utilisé que par
//     docker.spec.ts, ignoré sans Docker (et dans la CI).

export const racine = realpathSync(new URL('../..', import.meta.url).pathname);

/** Le Redis des tests (vitest.config.ts) : jamais celui de ton .env. */
export const ENV_REDIS: Record<string, string> = {
  REDIS_HOST: process.env.REDIS_HOST ?? 'localhost',
  REDIS_PORT: process.env.REDIS_PORT ?? '6379',
};

/** Toutes les variables que les tests fournissent à ton application (partie 7, plus Redis). */
export const ENV_P10: Record<string, string> = { ...ENV_AUTH, ...ENV_REDIS };

export const INDICE_REDIS = 'Lance Redis avec `docker compose up -d redis` à la racine du dépôt (voir le README, section « Partie 10 »), ou règle REDIS_HOST et REDIS_PORT.';

// --- Redis ------------------------------------------------------------------------------------------

let redisJoignable: Promise<void> | undefined;

/** Un client Redis vers le Redis des tests (à fermer avec `quit()`). */
export function clientRedis(): Redis {
  return new Redis({ host: ENV_REDIS.REDIS_HOST, port: Number(ENV_REDIS.REDIS_PORT), lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
}

/** Vérifie une fois que Redis répond, avec un message qui dit quoi faire sinon. */
export function verifierRedisJoignable(): Promise<void> {
  redisJoignable ??= (async () => {
    const client = clientRedis();
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.ping();
    } catch (erreur) {
      throw new Error(`Redis injoignable (${ENV_REDIS.REDIS_HOST}:${ENV_REDIS.REDIS_PORT}) : ${(erreur as Error).message}. ${INDICE_REDIS}`);
    } finally {
      client.disconnect();
    }
  })();
  return redisJoignable;
}

/**
 * Vide le Redis des tests (`FLUSHDB`), comme le `beforeEach` du cours : les compteurs du throttler y
 * survivent d'un lancement à l'autre.
 */
export async function viderRedis(): Promise<void> {
  await verifierRedisJoignable();
  const client = clientRedis();
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.flushdb();
  } finally {
    client.disconnect();
  }
}

/** Démarre ton application (comme en parties 7 à 9), avec aussi le Redis des tests. */
export async function lancerP10(options: OptionsBase = {}): Promise<AppAvecBase> {
  await verifierRedisJoignable();
  return lancerAvecAuth({ ...options, env: { ...ENV_REDIS, ...options.env } });
}

/**
 * Cherche un export par son nom dans src/, sans démarrer l'application : dans un dossier vide (ton .env
 * n'est pas lu) et avec les variables des tests (ton `ConfigModule.forRoot(...)`, chargé au passage,
 * ne doit pas rejeter faute de JWT_SECRET ou de REDIS_HOST).
 */
export async function chargerExport<T = unknown>(nom: string, indice: string): Promise<T> {
  const sauvegarde = new Map(Object.keys(ENV_P10).map((cle) => [cle, process.env[cle]]));
  Object.assign(process.env, ENV_P10);
  const dossier = mkdtempSync(join(tmpdir(), 'nestjs-open-p10-'));
  const initial = process.cwd();
  process.chdir(dossier);
  try {
    return await trouverExport<T>(nom, indice);
  } finally {
    process.chdir(initial);
    rmSync(dossier, { recursive: true, force: true });
    for (const [cle, valeur] of sauvegarde) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  }
}

/** Charge un fichier de src/ en repartant d'un code neuf (`chemin` sans extension, depuis src/). */
export { rechargerLeCode };

// --- Ton application compilée, lancée comme en production -----------------------------------------

export interface Construction {
  dossier: string;
  nettoyer(): void;
}

/**
 * `nest build` dans une copie de ton projet (src/, package.json, tsconfig*.json, nest-cli.json) : ton
 * dossier dist/ n'est jamais touché. Rejette avec la sortie du compilateur si la compilation échoue.
 */
export async function construire(): Promise<Construction> {
  const dossier = realpathSync(mkdtempSync(join(tmpdir(), 'nestjs-open-p10-build-')));
  for (const element of ['src', 'package.json', 'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json']) {
    if (existsSync(join(racine, element))) cpSync(join(racine, element), join(dossier, element), { recursive: true });
  }
  symlinkSync(join(racine, 'node_modules'), join(dossier, 'node_modules'));
  const nettoyer = () => rmSync(dossier, { recursive: true, force: true });
  const nest = join(racine, 'node_modules/@nestjs/cli/bin/nest.js');
  const { code, sortie } = await executer(process.execPath, [nest, 'build'], { cwd: dossier, env: { PATH: process.env.PATH ?? '' }, delai: 180_000 });
  if (code !== 0 || !existsSync(join(dossier, 'dist/main.js'))) {
    nettoyer();
    throw new Error(`\`npm run build\` échoue sur ton projet (code ${code}) : corrige d'abord la compilation.\n${sortie.slice(-3000)}`);
  }
  return { dossier, nettoyer };
}

export interface Resultat {
  code: number | null;
  signal: NodeJS.Signals | null;
  sortie: string;
}

/** Exécute une commande jusqu'au bout (ou jusqu'au délai), et rend son code et sa sortie. */
export function executer(commande: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; delai?: number }): Promise<Resultat> {
  return new Promise((resoudre) => {
    const enfant = spawn(commande, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '';
    enfant.stdout.on('data', (d: Buffer) => (sortie += d.toString()));
    enfant.stderr.on('data', (d: Buffer) => (sortie += d.toString()));
    const minuteur = setTimeout(() => {
      sortie += `\n[arrêté par le test après ${(options.delai ?? 60_000) / 1000} s]`;
      enfant.kill('SIGKILL');
    }, options.delai ?? 60_000);
    enfant.on('close', (code, signal) => {
      clearTimeout(minuteur);
      resoudre({ code, signal, sortie });
    });
  });
}

/** Un port TCP libre sur cette machine. */
export const portLibre = (): Promise<number> =>
  new Promise((resoudre) => {
    const serveur = createServer().listen(0, () => {
      const { port } = serveur.address() as { port: number };
      serveur.close(() => resoudre(port));
    });
  });

/** L'environnement complet de production que reçoit `node dist/main.js` (aucun fichier .env). */
export function envProduction(port: number): Record<string, string> {
  const e = process.env;
  return {
    PATH: e.PATH ?? '',
    NODE_ENV: 'production',
    PORT: String(port),
    DB_HOST: e.DB_HOST ?? 'localhost',
    DB_PORT: e.DB_PORT ?? '5432',
    DB_USER: e.DB_USER ?? 'marketplace',
    DB_PASSWORD: e.DB_PASSWORD ?? 'marketplace',
    DB_NAME: e.DB_NAME ?? 'marketplace_test',
    NOMBRE_MAX_PRODUITS: '1000',
    ...ENV_P10,
    THROTTLE_ACTIF: 'false',
  };
}

export interface Processus {
  port: number;
  url: string;
  /** Tout ce que le processus a écrit (sortie standard et erreurs), jusqu'ici. */
  sortie(): string;
  /** Les lignes de la sortie standard, jusqu'ici. */
  lignes(): string[];
  /** Se résout quand le processus s'est terminé. */
  fin: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  termine(): boolean;
  signaler(signal: NodeJS.Signals): void;
  arreter(): Promise<void>;
}

/** Lance `node dist/main.js` dans le dossier compilé, avec exactement ces variables. */
export function demarrer(construction: Construction, env: Record<string, string>): Processus {
  const enfant = spawn(process.execPath, ['dist/main.js'], { cwd: construction.dossier, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let tout = '';
  let fini = false;
  enfant.stdout.on('data', (d: Buffer) => {
    stdout += d.toString();
    tout += d.toString();
  });
  enfant.stderr.on('data', (d: Buffer) => (tout += d.toString()));
  const fin = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resoudre) =>
    enfant.on('close', (code, signal) => {
      fini = true;
      resoudre({ code, signal });
    }),
  );
  const port = Number(env.PORT);
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    sortie: () => tout,
    lignes: () => stdout.split('\n').filter((l) => l.trim() !== ''),
    fin,
    termine: () => fini,
    signaler: (signal) => {
      if (!fini) enfant.kill(signal);
    },
    arreter: async () => {
      if (fini) return;
      enfant.kill('SIGKILL');
      await fin;
    },
  };
}

/** Attend que le processus réponde sur /sante (ou meure) ; rejette avec sa sortie sinon. */
export async function attendrePret(processus: Processus, delai = 20_000): Promise<void> {
  const limite = Date.now() + delai;
  while (Date.now() < limite) {
    if (processus.termine()) {
      const { code } = await processus.fin;
      throw new Error(`\`node dist/main.js\` s'est arrêté (code ${code}) au lieu de démarrer :\n${processus.sortie().slice(-2500)}`);
    }
    try {
      const r = await fetch(`${processus.url}/sante`, { signal: AbortSignal.timeout(1000) });
      if (r.status < 500 || r.status === 503) return;
    } catch {
      // pas encore à l'écoute
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`\`node dist/main.js\` ne répond pas sur le port ${processus.port} après ${delai / 1000} s :\n${processus.sortie().slice(-2500)}`);
}

// --- Tes fichiers de déploiement ------------------------------------------------------------------

/** Le contenu d'un fichier à la racine du dépôt (null s'il n'existe pas). */
export function lireFichier(chemin: string): string | null {
  const complet = join(racine, chemin);
  return existsSync(complet) ? readFileSync(complet, 'utf8') : null;
}

/** Un fichier YAML de la racine, lu (ancres et `<<:` comprises) ; une erreur claire s'il manque ou ne se lit pas. */
export function lireYaml<T = any>(chemin: string, indice: string): T {
  const contenu = lireFichier(chemin);
  if (contenu === null) throw new Error(`Fichier attendu à la racine du dépôt : ${chemin}. ${indice}`);
  try {
    return parseYaml(contenu, { merge: true }) as T;
  } catch (erreur) {
    throw new Error(`${chemin} n'est pas un YAML valide : ${(erreur as Error).message}`);
  }
}

/** Tes workflows GitHub Actions (.github/workflows/*.yml), lus. */
export function lireWorkflows(): { fichier: string; contenu: any }[] {
  const dossier = join(racine, '.github/workflows');
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ fichier: `.github/workflows/${f}`, contenu: lireYaml(`.github/workflows/${f}`, '') }));
}

// Dockerfile ----------------------------------------------------------------------------------------

export interface Instruction {
  nom: string;
  args: string;
  ligne: number;
}

export interface Etape {
  /** L'image de départ (`FROM <image>`). */
  image: string;
  /** Son nom (`AS construction`), s'il y en a un. */
  alias?: string;
  instructions: Instruction[];
}

/** Découpe un Dockerfile en étapes (une par `FROM`), lignes continuées (`\`) et commentaires compris. */
export function lireDockerfile(contenu: string): Etape[] {
  const etapes: Etape[] = [];
  const lignes = contenu.split(/\r?\n/);
  let courante = '';
  let debut = 0;
  const logiques: { texte: string; ligne: number }[] = [];
  lignes.forEach((brute, i) => {
    const l = brute.trim();
    if (courante === '' && (l === '' || l.startsWith('#'))) return;
    if (courante !== '' && l.startsWith('#')) return;
    if (courante === '') debut = i + 1;
    if (l.endsWith('\\')) {
      courante += `${l.slice(0, -1)} `;
      return;
    }
    courante += l;
    logiques.push({ texte: courante.trim(), ligne: debut });
    courante = '';
  });
  if (courante.trim()) logiques.push({ texte: courante.trim(), ligne: debut });
  for (const { texte, ligne } of logiques) {
    const [, nom = '', args = ''] = /^(\S+)\s*(.*)$/s.exec(texte) ?? [];
    const instruction = { nom: nom.toUpperCase(), args: args.trim(), ligne };
    if (instruction.nom === 'FROM') {
      const morceaux = instruction.args.split(/\s+/).filter((m) => !m.startsWith('--'));
      const as = morceaux.findIndex((m) => m.toUpperCase() === 'AS');
      etapes.push({ image: morceaux[0] ?? '', alias: as >= 0 ? morceaux[as + 1] : undefined, instructions: [] });
    } else if (etapes.length > 0) {
      etapes.at(-1)!.instructions.push(instruction);
    }
  }
  return etapes;
}

/** La commande d'un `RUN`/`CMD`/`ENTRYPOINT`, en texte (forme JSON `["node", "…"]` comprise). */
export function commandeDe(args: string): { texte: string; exec: boolean; morceaux: string[] } {
  if (args.startsWith('[')) {
    try {
      const morceaux = JSON.parse(args) as string[];
      return { texte: morceaux.join(' '), exec: true, morceaux };
    } catch {
      // pas du JSON valide : forme « shell »
    }
  }
  return { texte: args, exec: false, morceaux: args.split(/\s+/) };
}

/** Les variables posées par des `ENV` (les deux syntaxes : `ENV A=1 B=2` et `ENV A 1`). */
export function variablesEnv(instructions: Instruction[], nom = 'ENV'): { cle: string; valeur: string; ligne: number }[] {
  const resultat: { cle: string; valeur: string; ligne: number }[] = [];
  for (const i of instructions.filter((x) => x.nom === nom)) {
    if (/^[^\s=]+=/.test(i.args)) {
      for (const m of i.args.matchAll(/([^\s=]+)=("[^"]*"|'[^']*'|\S*)/g)) resultat.push({ cle: m[1]!, valeur: m[2]!.replace(/^["']|["']$/g, ''), ligne: i.ligne });
    } else {
      const [cle = '', ...reste] = i.args.split(/\s+/);
      resultat.push({ cle, valeur: reste.join(' '), ligne: i.ligne });
    }
  }
  return resultat;
}

// .dockerignore -------------------------------------------------------------------------------------

/** Une règle de .dockerignore en expression régulière (syntaxe de Docker : `*`, `?`, `**`, `[...]`). */
function regleEnRegex(motif: string): RegExp {
  let r = '';
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i]!;
    if (c === '*') {
      if (motif[i + 1] === '*') {
        i++;
        if (motif[i + 1] === '/') {
          i++;
          r += '(?:.*/)?';
        } else r += '.*';
      } else r += '[^/]*';
    } else if (c === '?') r += '[^/]';
    else if (c === '[') {
      const fin = motif.indexOf(']', i);
      if (fin < 0) r += '\\[';
      else {
        r += `[${motif.slice(i + 1, fin).replace(/^!/, '^')}]`;
        i = fin;
      }
    } else if (c === '\\') r += `\\${motif[++i] ?? ''}`;
    else r += c.replace(/[.+^${}()|]/g, '\\$&');
  }
  return new RegExp(`^${r}$`);
}

/**
 * Le chemin (depuis la racine du contexte) serait-il écarté par ce .dockerignore ? Une règle qui vise un
 * dossier écarte aussi son contenu ; la dernière règle qui s'applique gagne (`!` pour réintégrer).
 */
export function estIgnore(dockerignore: string, chemin: string): boolean {
  const regles = dockerignore
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map((l) => {
      const negation = l.startsWith('!');
      const motif = (negation ? l.slice(1) : l).trim().replace(/^\.?\/+/, '').replace(/\/+$/, '');
      return { negation, regex: regleEnRegex(motif) };
    });
  const morceaux = chemin.split('/');
  const candidats = morceaux.map((_, i) => morceaux.slice(0, i + 1).join('/'));
  let ignore = false;
  for (const { negation, regex } of regles) if (candidats.some((c) => regex.test(c))) ignore = !negation;
  return ignore;
}

// compose.yaml -----------------------------------------------------------------------------------

export type Service = Record<string, any>;

/** Les variables d'un service, qu'elles soient écrites en liste (`- A=1`) ou en objet (`A: 1`). */
export function environnementDe(service: Service | undefined): Record<string, string> {
  const env = service?.environment;
  if (!env) return {};
  if (Array.isArray(env)) {
    return Object.fromEntries(
      env.map((e: string) => {
        const i = String(e).indexOf('=');
        return i < 0 ? [String(e), ''] : [String(e).slice(0, i), String(e).slice(i + 1)];
      }),
    );
  }
  return Object.fromEntries(Object.entries(env as Record<string, unknown>).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));
}

/** Les dépendances d'un service, avec leur condition (`service_started` par défaut). */
export function dependancesDe(service: Service | undefined): Record<string, string> {
  const d = service?.depends_on;
  if (!d) return {};
  if (Array.isArray(d)) return Object.fromEntries(d.map((n: string) => [n, 'service_started']));
  return Object.fromEntries(Object.entries(d as Record<string, { condition?: string } | null>).map(([n, v]) => [n, v?.condition ?? 'service_started']));
}

/** La commande d'un healthcheck, en texte (null s'il n'y en a pas, ou s'il est désactivé). */
export function testDeSante(service: Service | undefined): string | null {
  const h = service?.healthcheck;
  if (!h || h.disable === true) return null;
  const t = h.test;
  if (Array.isArray(t)) return t[0] === 'NONE' ? null : t.join(' ');
  return t ? String(t) : null;
}

export const commandeService = (service: Service | undefined): string => {
  const c = service?.command ?? service?.entrypoint;
  return Array.isArray(c) ? c.join(' ') : String(c ?? '');
};

/** Les ports publiés par un service, en texte (`"127.0.0.1:3000:3000"`, ou la syntaxe longue remise à plat). */
export function portsDe(service: Service | undefined): string[] {
  const p = service?.ports;
  if (!Array.isArray(p)) return [];
  return p.map((x: unknown) => {
    if (x && typeof x === 'object') {
      const o = x as { host_ip?: string; published?: unknown; target?: unknown };
      return [o.host_ip, o.published, o.target].filter((v) => v !== undefined && v !== '').join(':');
    }
    return String(x);
  });
}

export interface Roles {
  services: Record<string, Service>;
  base?: string;
  redis?: string;
  migrations?: string;
  api?: string;
}

/**
 * Retrouve les rôles de tes services, quels que soient leurs noms : la base (image PostgreSQL), Redis
 * (image Redis), les migrations (la commande contient `migration:run`) et l'API (le service restant qui
 * est construit ou tiré d'une image ; `api` ou `app` en priorité).
 */
export function roles(fichier: { services?: Record<string, Service> } | null | undefined): Roles {
  const services = (fichier?.services ?? {}) as Record<string, Service>;
  const noms = Object.keys(services);
  const image = (n: string) => String(services[n]?.image ?? '');
  const base = noms.find((n) => /postgres/i.test(image(n)));
  const redis = noms.find((n) => /redis/i.test(image(n)));
  const migrations = noms.find((n) => n !== base && n !== redis && /migration:run/.test(commandeService(services[n])));
  const restants = noms.filter((n) => ![base, redis, migrations].includes(n) && (services[n]?.build !== undefined || services[n]?.image !== undefined));
  const api = restants.find((n) => ['api', 'app'].includes(n)) ?? restants[0];
  return { services, base, redis, migrations, api };
}

/** `30s`, `1m30s`, `2m` → secondes (NaN si illisible). */
export function duree(valeur: unknown): number {
  const texte = String(valeur ?? '').trim();
  if (/^\d+$/.test(texte)) return Number(texte) / 1e9; // un nombre seul : des nanosecondes
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$/.exec(texte);
  if (!m || texte === '') return Number.NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 1000;
}

// --- Docker (docker.spec.ts seulement) ------------------------------------------------------------

/**
 * Docker est-il utilisable ici ? Jamais dans une CI (variable CI ou GITHUB_ACTIONS) ni avec
 * TESTS_DOCKER=0 ; sinon, si `docker info` répond. TESTS_DOCKER=1 force l'essai.
 */
export function dockerDisponible(): { ok: boolean; raison: string } {
  if (process.env.TESTS_DOCKER === '0') return { ok: false, raison: 'TESTS_DOCKER=0' };
  if (process.env.TESTS_DOCKER !== '1' && (process.env.CI || process.env.GITHUB_ACTIONS)) return { ok: false, raison: 'dans une CI (lance TESTS_DOCKER=1 pour forcer)' };
  const info = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 15_000 });
  if (info.status !== 0) return { ok: false, raison: '`docker info` ne répond pas (Docker absent ou arrêté)' };
  return { ok: true, raison: '' };
}
