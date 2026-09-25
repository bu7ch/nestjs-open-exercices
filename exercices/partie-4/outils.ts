import { getMetadataStorage } from 'class-validator';
import type { AppLancee } from '../aide.js';
import { trouverExport } from '../aide.js';

type Http = AppLancee['http'];

/** Tout le détail d'une réponse d'erreur, en une chaîne (le `message` de NestJS est une chaîne ou un tableau). */
export const detail = (corps: { message?: unknown }): string => [corps?.message ?? ''].flat().join(' | ');

/**
 * Les catégories que ton DTO autorise : lues dans ton `@IsIn([...])` sur `categorie` (exercice 4.4),
 * sinon, à défaut, les catégories des produits déjà présents.
 */
export async function categoriesAutorisees(http: Http): Promise<string[]> {
  try {
    const Dto = await trouverExport<new () => unknown>('CreerProduitDto', '');
    const regles = getMetadataStorage().getTargetValidationMetadatas(Dto, '', true, false);
    const isIn = regles.find((r) => r.propertyName === 'categorie' && r.name === 'isIn');
    const liste = isIn?.constraints?.[0] as unknown[] | undefined;
    if (Array.isArray(liste) && liste.length > 0) return liste.map(String);
  } catch {
    // pas encore de DTO : on se rabat sur les produits existants
  }
  const { body } = await http().get('/api/produits').query({ limite: 1000 });
  const categories = Array.isArray(body) ? [...new Set(body.map((p: { categorie: string }) => p.categorie))] : [];
  if (categories.length === 0) throw new Error('Impossible de trouver une catégorie valide : il faut des produits dans GET /api/produits (partie 3), ou `@IsIn([...])` sur `categorie` (exercice 4.4).');
  return categories as string[];
}

/** Un produit que ton DTO doit accepter. */
export async function produitValide(http: Http, extra: Record<string, unknown> = {}) {
  const [categorie] = await categoriesAutorisees(http);
  return { nom: 'Lampe de bureau', prix: 30, categorie, ...extra };
}

/** Le nombre total de produits (sans être gêné par `?limite=`). */
export async function nombreDeProduits(http: Http): Promise<number> {
  const { body } = await http().get('/api/produits').query({ limite: 100000 }).expect(200);
  return body.length;
}
