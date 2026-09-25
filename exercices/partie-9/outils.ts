/// <reference types="vite/client" />
import type { INestApplication } from '@nestjs/common';
import type { AppAvecBase } from '../partie-5/outils.js';
import { lancerAvecAuth } from '../partie-7/outils.js';
import { compteConnecte, creerBoutique, creerProduit, donnees, type CompteConnecte } from '../partie-8/outils.js';

// Les outils de la partie 9. Comme en parties 7 et 8, les tests démarrent ton application avec leurs
// propres secrets, se connectent par tes routes, et posent les produits directement avec tes entités.
// En plus : si tu as écrit `src/configurer-swagger.ts` (9.1), ta `configurerSwagger(app)` est appelée
// après ton `configurerApp`, AVANT `app.init()` (comme dans le test du cours), et le document OpenAPI
// qu'elle renvoie est gardé pour les tests de la documentation.

export { compteConnecte, creerBoutique, creerProduit, donnees, type CompteConnecte };

/** Les documents de ton code (sans l'exécuter) : pour savoir si `configurer-swagger.ts` existe. */
const fichiers: Record<string, () => Promise<unknown>> = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts']);
const SWAGGER = '../../src/configurer-swagger.ts';

export const INDICE_SWAGGER =
  'Écris `export function configurerSwagger(app: INestApplication)` dans src/configurer-swagger.ts : `DocumentBuilder` (titre, description, `addBearerAuth()`), `SwaggerModule.createDocument`, `SwaggerModule.setup(\'docs\', app, document)`, et `return document` (exercice 9.1).';

export type Document = {
  info?: { title?: string; description?: string };
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema>; securitySchemes?: Record<string, { type?: string; scheme?: string }> };
  security?: Record<string, unknown>[];
};
export type Operation = {
  summary?: string;
  tags?: string[];
  deprecated?: boolean;
  security?: Record<string, unknown>[];
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: Schema }>; schema?: Schema }>;
};
export type Schema = {
  $ref?: string;
  type?: string;
  items?: Schema;
  properties?: Record<string, Schema & { description?: string; example?: unknown }>;
  allOf?: Schema[];
  oneOf?: Schema[];
  description?: string;
  example?: unknown;
};

export interface AppP9 extends AppAvecBase {
  /** Le document de ton `configurerSwagger` (null si src/configurer-swagger.ts n'existe pas). */
  documentSwagger: Document | null;
  /** Pourquoi il n'y a pas de document (fichier absent, erreur…). */
  sansDocument?: string;
}

/** Démarre ton application sur une base vierge, avec ta documentation Swagger si tu l'as écrite. */
export async function lancerP9(): Promise<AppP9> {
  let documentSwagger: Document | null = null;
  let sansDocument: string | undefined = `Fichier attendu : src/configurer-swagger.ts. ${INDICE_SWAGGER}`;
  const lancee = await lancerAvecAuth({
    avantInit: async (app: INestApplication) => {
      const charger = fichiers[SWAGGER];
      if (!charger) return;
      const module = (await charger()) as { configurerSwagger?: (app: INestApplication) => unknown };
      if (typeof module.configurerSwagger !== 'function') {
        sansDocument = `src/configurer-swagger.ts n'exporte pas de fonction \`configurerSwagger\`. ${INDICE_SWAGGER}`;
        return;
      }
      const document = (await module.configurerSwagger(app)) as Document | undefined;
      sansDocument = undefined;
      if (document && typeof document === 'object' && 'paths' in document) documentSwagger = document;
    },
  });
  const resultat: AppP9 = { ...lancee, documentSwagger, sansDocument };
  // `configurerSwagger` ne renvoie pas le document : on le lit sur /docs-json.
  if (!resultat.documentSwagger && !sansDocument) {
    const r = await lancee.http().get('/docs-json');
    if (r.status === 200 && r.body?.paths) resultat.documentSwagger = r.body as Document;
    else resultat.sansDocument = `Ta \`configurerSwagger\` ne renvoie pas le document, et /docs-json répond ${r.status}. ${INDICE_SWAGGER}`;
  }
  return resultat;
}

/** Le document OpenAPI, ou une erreur qui dit quoi faire. */
export function exigerDocument(lancee: AppP9): Document {
  if (!lancee.documentSwagger) throw new Error(lancee.sansDocument ?? INDICE_SWAGGER);
  return lancee.documentSwagger;
}

/** Le schéma désigné par une référence `#/components/schemas/Nom` (undefined s'il n'existe pas). */
export function schemaDe(document: Document, ref: string): Schema | undefined {
  const nom = ref.replace('#/components/schemas/', '');
  return document.components?.schemas?.[nom];
}

/** Toutes les références `$ref` du document qui ne pointent vers aucun schéma (9.8, 9.14). */
export function referencesPendantes(document: Document): string[] {
  const pendantes = new Set<string>();
  const visiter = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(visiter);
    if (!x || typeof x !== 'object') return;
    for (const [cle, valeur] of Object.entries(x)) {
      if (cle === '$ref' && typeof valeur === 'string' && valeur.startsWith('#/components/schemas/') && !schemaDe(document, valeur)) pendantes.add(valeur);
      else visiter(valeur);
    }
  };
  visiter(document);
  return [...pendantes];
}

/** Les propriétés d'un schéma, en suivant `$ref` et `allOf` (et, pour une réponse enveloppée, `data`). */
export function proprietes(document: Document, schema: Schema | undefined, profondeur = 0): Record<string, Schema> {
  if (!schema || profondeur > 5) return {};
  if (schema.$ref) return proprietes(document, schemaDe(document, schema.$ref), profondeur + 1);
  const resultat: Record<string, Schema> = { ...schema.properties };
  for (const s of schema.allOf ?? []) Object.assign(resultat, proprietes(document, s, profondeur + 1));
  return resultat;
}

/** Le schéma de la réponse `statut` d'une opération. */
export function schemaReponse(operation: Operation | undefined, statut: string): Schema | undefined {
  const reponse = operation?.responses?.[statut];
  return reponse?.content?.['application/json']?.schema ?? Object.values(reponse?.content ?? {})[0]?.schema ?? reponse?.schema;
}

/** Le nom du schéma que désigne une référence (`#/components/schemas/ProduitReponseDto` → `ProduitReponseDto`). */
export const nomDeRef = (ref: string | undefined): string | undefined => ref?.replace('#/components/schemas/', '');

/**
 * Le schéma d'une page (`{ donnees, meta }`) : celui de la réponse, ou de son `data` si tu l'as
 * documentée enveloppée (8.13).
 */
export function schemaDePage(document: Document, schema: Schema | undefined): Record<string, Schema> {
  const props = proprietes(document, schema);
  if (!props.donnees && props.data) return proprietes(document, props.data);
  return props;
}

// --- Le catalogue -----------------------------------------------------------------------------------

export interface Page<T = Record<string, unknown>> {
  donnees: T[];
  meta: { page: number; limite: number; total: number; totalPages: number };
}

/** Lit une page de `GET /v2/api/produits` (le corps, ou son `data` après le 8.13). */
export function page<T = Record<string, unknown>>(r: { status: number; body: unknown }, route: string): Page<T> {
  const contenu = donnees<Page<T>>(r.body);
  if (r.status !== 200) throw new Error(`${route} a répondu ${r.status} au lieu de 200. Réponse : ${JSON.stringify(r.body).slice(0, 500)}`);
  if (!contenu || !Array.isArray(contenu.donnees) || !contenu.meta) {
    throw new Error(`${route} doit renvoyer une page \`{ donnees: [...], meta: { page, limite, total, totalPages } }\` (\`creerPage\`, exercice 9.7). Réponse : ${JSON.stringify(r.body).slice(0, 500)}`);
  }
  return contenu;
}

/** Un vendeur (et son compte) pour y ranger des produits. */
export async function boutique(lancee: AppAvecBase, nom = 'Boutique 9'): Promise<number> {
  const vendeur = await compteConnecte(lancee, 'vendeur');
  return creerBoutique(lancee, vendeur.id, nom);
}

/** Le message d'erreur (chaîne ou tableau) en une seule chaîne. */
export const messageDe = (corps: { message?: unknown } | undefined): string => [corps?.message ?? ''].flat().join(' | ');
