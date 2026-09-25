import { importer, lancer, trouverExport, type AppLancee } from '../aide.js';
import { categoriesAutorisees, detail, produitValide } from './outils.js';

type Classe = new (...args: never[]) => unknown;

describe('Partie 4 · DTO et class-validator (exercices 4.1 à 4.7)', () => {
  let lancee: AppLancee;
  let http: AppLancee['http'];

  beforeAll(async () => {
    lancee = await lancer();
    http = lancee.http;
  });
  afterAll(() => lancee?.fermer());

  it('4.1 · CreerProduitDto existe et sert de type au @Body() de ProduitsController', async () => {
    const Dto = await trouverExport<Classe>('CreerProduitDto', 'Crée la classe `CreerProduitDto` (par exemple dans src/produits/dto/creer-produit.dto.ts) et exporte-la.');
    const { ProduitsController } = await importer<Record<string, Classe>>('produits/produits.controller', '');
    const methodes = Object.getOwnPropertyNames(ProduitsController!.prototype);
    const utilise = methodes.some((m) => ((Reflect.getMetadata('design:paramtypes', ProduitsController!.prototype, m) as unknown[] | undefined) ?? []).includes(Dto));
    expect(utilise, 'une méthode de ProduitsController doit recevoir `@Body() dto: CreerProduitDto`').toBe(true);
  });

  it('4.1 · POST /api/produits crée un produit avec nom, prix et categorie', async () => {
    const produit = await produitValide(http);
    const r = await http().post('/api/produits').send(produit).expect(201);
    expect(r.body).toMatchObject(produit);
    expect(typeof r.body.id).toBe('number');
  });

  it('4.2 · les variantes envoyées sont renvoyées telles quelles', async () => {
    const produit = await produitValide(http, { variantes: ['S', 'M', 'L'] });
    const r = await http().post('/api/produits').send(produit).expect(201);
    expect(r.body.variantes).toEqual(['S', 'M', 'L']);
  });

  describe('4.4 · ValidationPipe global et règles du DTO', () => {
    it('un prix négatif est refusé (400), avec une règle qui nomme `prix`', async () => {
      const r = await http().post('/api/produits').send(await produitValide(http, { prix: -5 }));
      expect(r.status, 'as-tu activé `app.useGlobalPipes(new ValidationPipe(...))` dans main.ts, et `@Min(0)` sur prix ?').toBe(400);
      expect(Array.isArray(r.body.message), 'le 400 doit contenir la liste des règles violées').toBe(true);
      expect(detail(r.body)).toContain('prix');
    });

    it('un prix qui n\'est pas un nombre est refusé (400)', async () => {
      const r = await http().post('/api/produits').send(await produitValide(http, { prix: 'gratuit' }));
      expect(r.status, '`@IsNumber()` sur prix').toBe(400);
      expect(detail(r.body)).toContain('prix');
    });

    it('un produit sans `nom` est refusé (400), avec une règle qui nomme `nom`', async () => {
      const { nom: _nom, ...sansNom } = await produitValide(http);
      const r = await http().post('/api/produits').send(sansNom);
      expect(r.status, '`@IsString() @IsNotEmpty()` sur nom').toBe(400);
      expect(detail(r.body)).toContain('nom');
    });

    it('un `nom` vide est refusé (400)', async () => {
      const r = await http().post('/api/produits').send(await produitValide(http, { nom: '' }));
      expect(r.status, '`@IsNotEmpty()` sur nom').toBe(400);
      expect(detail(r.body)).toContain('nom');
    });

    it('une catégorie hors de ta liste fixe est refusée (400), et chaque catégorie de la liste est acceptée', async () => {
      const r = await http().post('/api/produits').send(await produitValide(http, { categorie: 'categorie-qui-nexiste-pas' }));
      expect(r.status, '`@IsIn([...])` sur categorie').toBe(400);
      expect(detail(r.body)).toContain('categorie');
      for (const categorie of await categoriesAutorisees(http)) {
        await http().post('/api/produits').send(await produitValide(http, { categorie })).expect(201);
      }
    });
  });

  describe('4.5 · variantes optionnel', () => {
    it('un produit sans variantes est accepté', async () => {
      await http().post('/api/produits').send(await produitValide(http)).expect(201);
    });

    it('un produit avec des variantes est accepté', async () => {
      await http().post('/api/produits').send(await produitValide(http, { variantes: ['rouge', 'bleu'] })).expect(201);
    });

    it('des variantes qui ne sont pas un tableau sont refusées (400) : garde `@IsArray()`', async () => {
      const r = await http().post('/api/produits').send(await produitValide(http, { variantes: 'S' }));
      expect(r.status, '`@IsArray()` sur variantes').toBe(400);
      expect(detail(r.body)).toContain('variantes');
    });
  });

  it('4.6 · un champ en trop est refusé (400), avec un message qui le nomme', async () => {
    const r = await http().post('/api/produits').send(await produitValide(http, { remise: 50 }));
    expect(r.status, 'active `whitelist: true` et `forbidNonWhitelisted: true` dans les options de ValidationPipe').toBe(400);
    expect(detail(r.body)).toContain('remise');
  });

  it('4.7 · un nombre glissé dans les variantes est refusé (400)', async () => {
    const r = await http().post('/api/produits').send(await produitValide(http, { variantes: ['S', 42, 'L'] }));
    expect(r.status, '`@IsString({ each: true })` sur variantes').toBe(400);
    expect(detail(r.body)).toContain('variantes');
  });
});
