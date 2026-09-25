import { APP_GUARD } from '@nestjs/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';
import { importer, meta, trouverExport } from '../aide.js';
import { entite, lancerAvecBase, sql, type AppAvecBase, type OptionsBase } from '../partie-5/outils.js';

// Les outils de la partie 7. Comme toujours, ton .env n'est jamais lu : les tests fournissent eux-mêmes
// leurs secrets (JWT_SECRET, JWT_REFRESH_SECRET), et coupent la limitation de débit (THROTTLE_ACTIF=false,
// exercice 7.19), sauf dans les tests qui la vérifient (abus.spec.ts).

/** Les secrets des tests : connus ici, ils permettent de vérifier (et de fabriquer) tes jetons. */
export const SECRET = 'secret-des-tests-de-la-partie-7-au-moins-32-caracteres';
export const SECRET_REFRESH = 'autre-secret-des-tests-partie-7-pour-les-refresh-tokens';

export const ENV_AUTH: Record<string, string> = { JWT_SECRET: SECRET, JWT_REFRESH_SECRET: SECRET_REFRESH, THROTTLE_ACTIF: 'false' };

/** Le mot de passe des comptes créés par les tests (ils vérifient qu'il n'est JAMAIS stocké tel quel). */
export const MOT_DE_PASSE = 'MotDePasse!42';

/** Démarre ton application sur la base de test, avec les variables de la partie 7. */
export async function lancerAvecAuth(options: OptionsBase = {}): Promise<AppAvecBase> {
  const lancee = await lancerAvecBase({ ...options, env: { ...ENV_AUTH, ...options.env } });
  // Un serveur qui écoute une fois pour toutes : sinon Supertest l'ouvre et le referme à chaque requête,
  // et une longue suite de requêtes (throttler, chronométrage) finit par tomber sur un `socket hang up`.
  const serveur = lancee.app.getHttpServer() as { listening?: boolean };
  if (!serveur.listening) await lancee.app.listen(0);
  return lancee;
}

type Http = AppAvecBase['http'];

let numero = 0;
/** Un email jamais utilisé dans ce fichier de test. */
export const nouvelEmail = (prefixe = 'compte'): string => `${prefixe}.${process.pid}.${++numero}@exemple.fr`;

const INDICE_429 = 'La limitation de débit (7.18) est active pendant les tests : ils fixent THROTTLE_ACTIF=false, que ton `skipIf` doit lire dans process.env (exercice 7.19).';

function expliquer(route: string, statut: number, attendu: number, exercice: string, corps: unknown): string {
  const indice = statut === 429 ? INDICE_429 : statut === 404 ? `la route ${route} n'existe pas encore` : statut === 401 ? `ajoute \`@Public()\` sur ${route} (exercice 7.8)` : '';
  return `${route} a répondu ${statut} au lieu de ${attendu} (exercice ${exercice})${indice ? ` : ${indice}` : ''}. Réponse : ${JSON.stringify(corps)}`;
}

export interface CompteCree {
  id: number;
  email: string;
}

/** Inscrit un compte par ta route (7.4) ; échoue avec un message clair si elle ne répond pas 201. */
export async function inscrire(http: Http, email = nouvelEmail(), motDePasse = MOT_DE_PASSE): Promise<CompteCree> {
  const r = await http().post('/api/auth/inscription').send({ email, motDePasse });
  if (r.status !== 201) throw new Error(expliquer('POST /api/auth/inscription', r.status, 201, '7.4', r.body));
  return { id: Number(r.body?.id), email };
}

export interface Jetons {
  accessToken: string;
  refreshToken?: string;
}

/** Se connecte par ta route (7.5) ; échoue avec un message clair si elle ne répond pas 200 avec un accessToken. */
export async function connecter(http: Http, email: string, motDePasse = MOT_DE_PASSE): Promise<Jetons> {
  const r = await http().post('/api/auth/connexion').send({ email, motDePasse });
  if (r.status !== 200) throw new Error(expliquer('POST /api/auth/connexion', r.status, 200, '7.5', r.body));
  if (typeof r.body?.accessToken !== 'string') throw new Error(`POST /api/auth/connexion doit renvoyer { accessToken } (exercice 7.5). Réponse : ${JSON.stringify(r.body)}`);
  return r.body as Jetons;
}

/** Un compte neuf, et son en-tête `Authorization: Bearer <jeton>`. Avec `role`, le compte est d'abord passé à ce rôle en base. */
export async function compteConnecte(lancee: AppAvecBase, role?: string): Promise<CompteCree & { bearer: string; jetons: Jetons }> {
  const compte = await inscrire(lancee.http);
  if (role) await definirRole(lancee.ds, compte.email, role);
  const jetons = await connecter(lancee.http, compte.email);
  return { ...compte, bearer: `Bearer ${jetons.accessToken}`, jetons };
}

/** Le contenu (non vérifié) d'un JWT : ce que n'importe qui peut lire. */
export function decoder(jeton: string): Record<string, unknown> {
  const morceaux = String(jeton).split('.');
  if (morceaux.length !== 3) throw new Error(`Ce n'est pas un JWT (trois morceaux séparés par des points) : ${String(jeton).slice(0, 40)}…`);
  return JSON.parse(Buffer.from(morceaux[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Vérifie un JWT avec un secret : le contenu s'il est valide, null sinon. */
export function verifier(jeton: string, secret: string): Record<string, unknown> | null {
  try {
    return new JwtService({ secret }).verify(jeton);
  } catch {
    return null;
  }
}

/** Fabrique un jeton signé avec le secret des tests (ou un autre), sans passer par ton application. */
export const fabriquerJeton = (contenu: Record<string, unknown>, options: JwtSignOptions = {}, secret = SECRET): string =>
  new JwtService({ secret }).sign(contenu, { expiresIn: '15m', ...options });

export const INDICE_COMPTE = 'Crée l\'entité `Compte` (`@Entity(\'comptes\')`) et déclare-la avec `TypeOrmModule.forFeature([Compte])` dans son module (exercice 7.2).';

/** La table de ton entité Compte (`comptes`). */
export const tableComptes = (ds: DataSource): string => entite(ds, 'Compte', INDICE_COMPTE).tableName;

/** Change le rôle d'un compte directement en base (comme le `UPDATE` SQL des exercices 7.12 et 7.14). */
export async function definirRole(ds: DataSource, email: string, role: string): Promise<void> {
  await sql(`UPDATE "${tableComptes(ds)}" SET role = $1 WHERE email = $2`, [role, email]);
}

/** La ligne d'un compte, TOUTES colonnes comprises (lue en SQL, sans le `select: false` de TypeORM). */
export async function ligneCompte(ds: DataSource, email: string): Promise<Record<string, unknown> | undefined> {
  const [ligne] = await sql(`SELECT * FROM "${tableComptes(ds)}" WHERE email = $1`, [email]);
  return ligne;
}

/** Le message d'erreur de NestJS, apostrophes typographiques normalisées. */
export const messageDe = (corps: { message?: unknown }): string => [corps?.message ?? ''].flat().join(' | ').replace(/’/g, '\'');

/**
 * Les guards déclarés avec `{ provide: APP_GUARD, useClass: ... }` dans les modules d'AppModule, dans
 * l'ordre où on les trouve (à appeler après `lancerAvecAuth`, qui a chargé ton code).
 */
export async function gardesGlobaux(): Promise<string[]> {
  const { AppModule } = await importer<{ AppModule: object }>('app.module', '');
  const noms: string[] = [];
  const vus = new Set<unknown>();
  const aVisiter: unknown[] = [AppModule];
  while (aVisiter.length > 0) {
    let m = aVisiter.shift();
    if (m instanceof Promise) m = await m.catch(() => undefined);
    if (!m || vus.has(m)) continue;
    vus.add(m);
    const dynamique = typeof m === 'object' ? (m as { module?: object; imports?: unknown[]; providers?: unknown[] }) : undefined;
    const classe = (dynamique ? dynamique.module : m) as object | undefined;
    const fournisseurs = [...(classe ? meta('providers', classe) : []), ...(dynamique?.providers ?? [])];
    for (const p of fournisseurs) {
      const f = p as { provide?: unknown; useClass?: { name?: string } };
      if (f && typeof f === 'object' && f.provide === APP_GUARD) noms.push(f.useClass?.name ?? '?');
    }
    aVisiter.push(...(classe ? meta('imports', classe) : []), ...(dynamique?.imports ?? []));
  }
  return noms;
}

/**
 * Cherche des exports par leur nom dans src/ (comme `trouverExport`), sans démarrer l'application :
 * dans un dossier vide (ton .env n'est pas lu) et avec les variables des tests, pour que ton
 * `ConfigModule.forRoot(...)`, chargé au passage, ne rejette pas faute de JWT_SECRET.
 */
export async function chargerExports<T extends Record<string, unknown>>(indices: Record<keyof T & string, string>): Promise<T> {
  const sauvegarde = new Map(Object.keys(ENV_AUTH).map((cle) => [cle, process.env[cle]]));
  Object.assign(process.env, ENV_AUTH);
  const dossier = mkdtempSync(join(tmpdir(), 'nestjs-open-p7-'));
  const initial = process.cwd();
  process.chdir(dossier);
  try {
    const trouves: Record<string, unknown> = {};
    for (const [nom, indice] of Object.entries(indices)) trouves[nom] = await trouverExport(nom, indice as string);
    return trouves as T;
  } finally {
    process.chdir(initial);
    rmSync(dossier, { recursive: true, force: true });
    for (const [cle, valeur] of sauvegarde) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  }
}
