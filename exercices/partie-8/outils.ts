/// <reference types="vite/client" />
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { meta } from '../aide.js';
import { entite, relationVers, sql, type AppAvecBase } from '../partie-5/outils.js';
import { ENV_AUTH, lancerAvecAuth, MOT_DE_PASSE, nouvelEmail, tableComptes } from '../partie-7/outils.js';

// Les outils de la partie 8. Comme en partie 7, les tests démarrent ton application avec leurs propres
// secrets (JWT_SECRET…) et se connectent par tes routes. Une différence : à partir de l'exercice 8.13,
// tes réponses réussies peuvent être enveloppées (`{ "data": … }`) ; ces outils acceptent les deux formes.

export { lancerAvecAuth, nouvelEmail };

/** Le contenu utile d'une réponse réussie : `body.data` si elle est enveloppée (8.13), sinon `body`. */
export function donnees<T = any>(corps: unknown): T {
  if (corps && typeof corps === 'object' && !Array.isArray(corps) && Object.keys(corps).length === 1 && 'data' in corps) {
    return (corps as { data: T }).data;
  }
  return corps as T;
}

/** Une requête prête à partir (Supertest), et ce qu'on lit de sa réponse. */
export interface ReponseHttp {
  status: number;
  body: any;
  headers: Record<string, any>;
  text: string;
}
export type Envoi = () => PromiseLike<ReponseHttp>;

export interface CompteConnecte {
  id: number;
  email: string;
  bearer: string;
}

function expliquer(route: string, statut: number, attendu: number, exercice: string, corps: unknown): string {
  return `${route} a répondu ${statut} au lieu de ${attendu} (exercice ${exercice}). Réponse : ${JSON.stringify(corps)}`;
}

/** Un compte neuf, inscrit et connecté par tes routes (7.4, 7.5) ; avec `role`, passé à ce rôle en base. */
export async function compteConnecte(lancee: AppAvecBase, role?: string): Promise<CompteConnecte> {
  const email = nouvelEmail('p8');
  const inscription = await lancee.http().post('/api/auth/inscription').send({ email, motDePasse: MOT_DE_PASSE });
  if (inscription.status !== 201) throw new Error(expliquer('POST /api/auth/inscription', inscription.status, 201, '7.4', inscription.body));
  if (role) await sql(`UPDATE "${tableComptes(lancee.ds)}" SET role = $1 WHERE email = $2`, [role, email]);
  const connexion = await lancee.http().post('/api/auth/connexion').send({ email, motDePasse: MOT_DE_PASSE });
  if (connexion.status !== 200) throw new Error(expliquer('POST /api/auth/connexion', connexion.status, 200, '7.5', connexion.body));
  const jeton = donnees<{ accessToken?: unknown }>(connexion.body)?.accessToken;
  if (typeof jeton !== 'string') throw new Error(`POST /api/auth/connexion doit renvoyer { accessToken } (exercice 7.5, enveloppé dans { data } après le 8.13). Réponse : ${JSON.stringify(connexion.body)}`);
  return { id: Number(donnees<{ id: unknown }>(inscription.body)?.id), email, bearer: `Bearer ${jeton}` };
}

// --- Des données, posées directement avec tes entités (plus court que de rejouer les routes) -------

const INDICE_VENDEUR_COMPTE = 'L\'entité Vendeur doit garder sa relation vers Compte (exercice 7.14).';

/** Une boutique (Vendeur) qui appartient à `compteId`. */
export async function creerBoutique(lancee: AppAvecBase, compteId: number, nom = 'Boutique'): Promise<number> {
  const vendeur = entite(lancee.ds, 'Vendeur', '');
  const versCompte = vendeur.relations.find((r) => r.inverseEntityMetadata.name === 'Compte' && r.joinColumns.length > 0);
  if (!versCompte) throw new Error(`L'entité Vendeur n'a pas de relation vers Compte. ${INDICE_VENDEUR_COMPTE}`);
  const cree = (await lancee.ds.getRepository('Vendeur').save({ nom, [versCompte.propertyName]: { id: compteId } })) as unknown as { id: number };
  return cree.id;
}

/** Un produit de la boutique `vendeurId` (avec, en plus, les colonnes de `champs`). */
export async function creerProduit(lancee: AppAvecBase, vendeurId: number, champs: Record<string, unknown> = {}): Promise<number> {
  const produit = entite(lancee.ds, 'Produit', '');
  const versVendeur = relationVers(produit, 'Vendeur', 'many-to-one');
  if (!versVendeur) throw new Error('L\'entité Produit n\'a plus de relation vers Vendeur (exercice 5.9).');
  const cree = (await lancee.ds.getRepository('Produit').save({ nom: 'Lampe', prix: 30, categorie: 'mobilier', ...champs, [versVendeur.propertyName]: { id: vendeurId } })) as unknown as { id: number };
  return cree.id;
}

/** Une commande d'une unité d'une variante (neuve) du produit, passée par ta route POST /api/commandes (5.12). */
export async function creerCommande(lancee: AppAvecBase, produitId: number, bearer: string): Promise<number> {
  const variante = entite(lancee.ds, 'Variante', '');
  const versProduit = relationVers(variante, 'Produit', 'many-to-one');
  if (!versProduit) throw new Error('L\'entité Variante n\'a plus de relation vers Produit (exercice 5.11).');
  const { id: varianteId } = (await lancee.ds.getRepository('Variante').save({ nom: 'Rouge', [versProduit.propertyName]: { id: produitId } })) as unknown as { id: number };
  const r = await lancee.http().post('/api/commandes').set('Authorization', bearer).send({ lignes: [{ varianteId, quantite: 1 }] });
  if (r.status !== 201) throw new Error(expliquer('POST /api/commandes', r.status, 201, '5.12', r.body));
  return Number(donnees<{ id: unknown }>(r.body)?.id);
}

/** Change une colonne d'une commande directement en SQL (comme le `UPDATE` du cours). */
export async function definirStatut(lancee: AppAvecBase, commandeId: number, statut: string): Promise<void> {
  const table = entite(lancee.ds, 'Commande', '').tableName;
  await sql(`UPDATE "${table}" SET statut = $1 WHERE id = $2`, [statut, commandeId]);
}

// --- Ton code, vu de l'extérieur ------------------------------------------------------------------

const modules: Record<string, () => Promise<unknown>> = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts']);
const aNePasCharger = (chemin: string) =>
  ['main.ts', 'seed.ts', 'data-source.ts'].some((f) => chemin === `../../src/${f}`) || chemin.startsWith('../../src/migrations/');

export interface Export {
  /** Le fichier, depuis la racine du dépôt (`src/commun/toutes-exceptions.filter.ts`). */
  fichier: string;
  nom: string;
  valeur: unknown;
}

export interface Route {
  methode: string;
  /** Le chemin complet, sans `/` au début (`api/commandes/:id/expedier`). */
  chemin: string;
  controleur: Function;
  handler: Function;
  /** Les guards et interceptors de la route puis ceux du contrôleur (classes). */
  gardes: Function[];
  interceptors: Function[];
}

export interface Carte {
  exports: Export[];
  routes: Route[];
  /** Les classes déclarées avec APP_GUARD, APP_INTERCEPTOR, APP_FILTER dans les modules d'AppModule. */
  globaux: { gardes: Function[]; interceptors: Function[]; filtres: Function[] };
}

const METHODES = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD', 'SEARCH'];
const classeDe = (x: unknown): Function | undefined => (typeof x === 'function' ? x : x && typeof x === 'object' ? (x as object).constructor : undefined);
const joindre = (...morceaux: unknown[]) =>
  morceaux
    .flat()
    .map((m) => String(m ?? '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

/**
 * Charge tout ton src/ (sauf main.ts, seed.ts, data-source.ts et les migrations) et en dresse la carte :
 * ce que chaque fichier exporte, les routes de tes contrôleurs avec leurs guards et interceptors, et
 * tes briques globales. Dans un dossier vide et avec les variables des tests (ton .env n'est pas lu).
 */
export async function cartographier(): Promise<Carte> {
  const sauvegarde = new Map(Object.keys(ENV_AUTH).map((cle) => [cle, process.env[cle]]));
  Object.assign(process.env, ENV_AUTH);
  const dossier = mkdtempSync(join(tmpdir(), 'nestjs-open-p8-'));
  const initial = process.cwd();
  process.chdir(dossier);
  try {
    const exports: Export[] = [];
    for (const [chemin, charger] of Object.entries(modules)) {
      if (aNePasCharger(chemin)) continue;
      let contenu: Record<string, unknown>;
      try {
        contenu = (await charger()) as Record<string, unknown>;
      } catch {
        continue;
      }
      for (const [nom, valeur] of Object.entries(contenu)) exports.push({ fichier: chemin.replace('../../', ''), nom, valeur });
    }

    const routes: Route[] = [];
    for (const { valeur } of exports) {
      if (typeof valeur !== 'function' || Reflect.getMetadata('__controller__', valeur) !== true) continue;
      const controleur = valeur;
      const cheminControleur = Reflect.getMetadata('path', controleur) as unknown;
      for (const nom of Object.getOwnPropertyNames(controleur.prototype)) {
        const handler = (controleur.prototype as Record<string, unknown>)[nom];
        if (nom === 'constructor' || typeof handler !== 'function') continue;
        const methode = Reflect.getMetadata('method', handler) as number | undefined;
        if (methode === undefined) continue;
        const cheminMethode = Reflect.getMetadata('path', handler) as unknown;
        const listes = (cle: string) => [...meta(cle, handler), ...meta(cle, controleur)].map(classeDe).filter((c): c is Function => !!c);
        for (const base of [cheminControleur].flat()) {
          for (const suite of [cheminMethode].flat()) {
            routes.push({ methode: METHODES[methode] ?? '?', chemin: joindre(base, suite), controleur, handler, gardes: listes('__guards__'), interceptors: listes('__interceptors__') });
          }
        }
      }
    }

    const globaux: Carte['globaux'] = { gardes: [], interceptors: [], filtres: [] };
    const appModule = exports.find((e) => e.fichier === 'src/app.module.ts' && e.nom === 'AppModule')?.valeur;
    const vus = new Set<unknown>();
    const aVisiter: unknown[] = appModule ? [appModule] : [];
    while (aVisiter.length > 0) {
      let m = aVisiter.shift();
      if (m instanceof Promise) m = await m.catch(() => undefined);
      if (!m || vus.has(m)) continue;
      vus.add(m);
      const dynamique = typeof m === 'object' ? (m as { module?: object; imports?: unknown[]; providers?: unknown[] }) : undefined;
      const classe = (dynamique ? dynamique.module : m) as object | undefined;
      for (const p of [...(classe ? meta('providers', classe) : []), ...(dynamique?.providers ?? [])]) {
        const f = p as { provide?: unknown; useClass?: Function; useValue?: unknown };
        if (!f || typeof f !== 'object') continue;
        const valeur = f.useClass ?? classeDe(f.useValue);
        if (!valeur) continue;
        if (f.provide === APP_GUARD) globaux.gardes.push(valeur);
        if (f.provide === APP_INTERCEPTOR) globaux.interceptors.push(valeur);
        if (f.provide === APP_FILTER) globaux.filtres.push(valeur);
      }
      aVisiter.push(...(classe ? meta('imports', classe) : []), ...(dynamique?.imports ?? []));
    }
    return { exports, routes, globaux };
  } finally {
    process.chdir(initial);
    rmSync(dossier, { recursive: true, force: true });
    for (const [cle, valeur] of sauvegarde) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  }
}

/** La route `methode chemin` (les paramètres peuvent porter un autre nom : `:id`, `:commandeId`…). */
export function trouverRoute(carte: Carte, methode: string, chemin: string): Route | undefined {
  const forme = (c: string) => c.replace(/:[^/]+/g, ':');
  return carte.routes.find((r) => r.methode === methode && forme(r.chemin) === forme(chemin));
}

/** Le fichier qui exporte cette valeur (la classe elle-même, pas une copie). */
export function exportDe(carte: Carte, valeur: unknown): Export | undefined {
  return carte.exports.find((e) => e.valeur === valeur);
}

/** Le premier export nommé `nom` (null s'il n'y en a pas). */
export function exportNomme(carte: Carte, nom: string): Export | undefined {
  return carte.exports.find((e) => e.nom === nom);
}

/**
 * La clé de métadonnée que pose un décorateur comme `@StatutRequis('payee')` : `SetMetadata` la donne
 * (`.KEY`) ; sinon, on l'applique à une méthode factice et on regarde ce qu'il y a posé.
 */
export function cleDeMetadonnee(decorateur: unknown, argument: unknown): string | undefined {
  if (typeof decorateur !== 'function') return undefined;
  const pose = (decorateur as (a: unknown) => unknown)(argument) as ((...a: unknown[]) => unknown) & { KEY?: string };
  if (typeof pose?.KEY === 'string') return pose.KEY;
  const cible = { methode() {} };
  const descripteur = Object.getOwnPropertyDescriptor(cible, 'methode')!;
  try {
    pose(cible, 'methode', descripteur);
  } catch {
    return undefined;
  }
  return Reflect.getMetadataKeys(descripteur.value as object).map(String).find((c) => !c.startsWith('design:'));
}

/** Les colonnes de Produit en plus de celles des parties 3 à 7 : ton champ interne (8.11). */
export function champsInternes(lancee: AppAvecBase): { nom: string; type: string }[] {
  const produit = entite(lancee.ds, 'Produit', '');
  const connues = new Set(['id', 'nom', 'prix', 'categorie', 'actif', 'description', 'stock', 'dateCreation', 'creeLe', 'modifieLe', 'dateModification']);
  return produit.columns
    .filter((c) => !c.relationMetadata && !c.isPrimary && !c.isCreateDate && !c.isUpdateDate && !c.isVersion && !connues.has(c.propertyName))
    .map((c) => ({ nom: c.propertyName, type: lancee.ds.driver.normalizeType(c) }));
}
