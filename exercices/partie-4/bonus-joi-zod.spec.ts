import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { lancer, refusDeDemarrer, trouverExport } from '../aide.js';

// Bonus de la section e. Ces tests vérifient le COMPORTEMENT attendu ; ils ne regardent pas
// quelle bibliothèque tu utilises (4.14 passe aussi avec la validation class-validator du 4.13).

interface SchemaZod {
  safeParse(valeur: unknown): { success: boolean; data?: unknown };
  shape?: Record<string, { options?: unknown[] }>;
}

const trouverSchema = () =>
  trouverExport<SchemaZod>('creerProduitSchema', 'Écris et exporte `creerProduitSchema` (par exemple dans src/produits/dto/creer-produit.schema.ts).');

async function produitPourSchema(schema: SchemaZod) {
  const options = schema.shape?.categorie?.options;
  expect(Array.isArray(options) && options.length > 0, '`categorie` doit être un `z.enum([...])`').toBe(true);
  return { nom: 'Lampe de bureau', prix: 30, categorie: options![0] };
}

describe('Partie 4 · Bonus : Joi et Zod (exercices 4.14 à 4.16)', () => {
  describe('4.14 · la configuration validée par un schéma (Joi)', () => {
    it('sans NOMBRE_MAX_PRODUITS, l\'application refuse de démarrer, avec un message qui le nomme', async () => {
      const message = await refusDeDemarrer(
        { env: { NOMBRE_MAX_PRODUITS: undefined } },
        'Passe un schéma Joi à `validationSchema` dans `ConfigModule.forRoot(...)`, avec `NOMBRE_MAX_PRODUITS: Joi.number().required()`.',
      );
      expect(message).toContain('NOMBRE_MAX_PRODUITS');
    });

    it('avec un .env complet, elle démarre toujours normalement', async () => {
      const lancee = await lancer({ env: { PORT: undefined, NOMBRE_MAX_PRODUITS: undefined }, fichierEnv: 'PORT=0\nNOMBRE_MAX_PRODUITS=50\n' });
      try {
        await lancee.http().get('/api/produits').expect(200);
      } finally {
        await lancee.fermer();
      }
    });
  });

  describe('4.15 · creerProduitSchema (Zod)', () => {
    it('accepte un produit valide', async () => {
      const schema = await trouverSchema();
      const produit = await produitPourSchema(schema);
      const resultat = schema.safeParse(produit);
      expect(resultat.success).toBe(true);
      expect(resultat.data).toEqual(produit);
    });

    it('refuse un nom vide, un prix négatif et une catégorie hors de la liste', async () => {
      const schema = await trouverSchema();
      const produit = await produitPourSchema(schema);
      expect(schema.safeParse({ ...produit, nom: '' }).success, 'nom : `z.string().min(1)`').toBe(false);
      expect(schema.safeParse({ ...produit, prix: -1 }).success, 'prix : `z.number().min(0)`').toBe(false);
      expect(schema.safeParse({ ...produit, prix: '30' }).success, 'prix doit être un nombre').toBe(false);
      expect(schema.safeParse({ ...produit, categorie: 'categorie-qui-nexiste-pas' }).success, 'categorie : `z.enum([...])`').toBe(false);
      const { nom: _nom, ...sansNom } = produit;
      expect(schema.safeParse(sansNom).success, 'nom est obligatoire').toBe(false);
    });
  });

  describe('4.16 · ZodValidationPipe', () => {
    const creerPipe = async () => {
      const ZodValidationPipe = await trouverExport<new (schema: unknown) => PipeTransform>(
        'ZodValidationPipe',
        'Écris et exporte `ZodValidationPipe` (par exemple dans src/common/zod-validation.pipe.ts).',
      );
      const schema = await trouverSchema();
      return { pipe: new ZodValidationPipe(schema), produit: await produitPourSchema(schema) };
    };

    it('laisse passer un produit valide', async () => {
      const { pipe, produit } = await creerPipe();
      expect(await pipe.transform(produit, { type: 'body' })).toEqual(produit);
    });

    it('rejette un produit invalide avec une BadRequestException (400) qui détaille chaque champ en tort', async () => {
      const { pipe, produit } = await creerPipe();
      let erreur: unknown;
      try {
        await pipe.transform({ ...produit, nom: '', prix: -1 }, { type: 'body' });
      } catch (e) {
        erreur = e;
      }
      expect(erreur, 'le pipe doit lever une BadRequestException').toBeInstanceOf(BadRequestException);
      const detail = JSON.stringify((erreur as BadRequestException).getResponse());
      expect(detail).toContain('nom');
      expect(detail).toContain('prix');
    });
  });
});
