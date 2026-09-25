import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { demarrer, importer, meta } from '../aide.js';

type Classe = new (...args: never[]) => unknown;
type Fichier = Record<string, Classe>;

describe('Partie 3 · Modules et services (exercices 3.7 à 3.11)', () => {
  it('3.7 · ProduitsController est déclaré dans ProduitsModule, plus dans AppModule', async () => {
    const { ProduitsModule } = await importer<Fichier>('produits/produits.module', 'Génère-le avec `npx nest g module produits`.');
    const { ProduitsController } = await importer<Fichier>('produits/produits.controller', 'Génère-le avec `npx nest g controller produits`.');
    expect(meta('controllers', ProduitsModule!)).toContain(ProduitsController);
    expect(meta('controllers', AppModule)).not.toContain(ProduitsController);
    expect(meta('imports', AppModule)).toContain(ProduitsModule);
  });

  it('3.8 · CategoriesModule existe, avec son controller, et AppModule l\'importe', async () => {
    const { CategoriesModule } = await importer<Fichier>('categories/categories.module', 'Génère-le avec `npx nest g module categories`.');
    const { CategoriesController } = await importer<Fichier>('categories/categories.controller', 'Génère-le avec `npx nest g controller categories`.');
    expect(meta('controllers', CategoriesModule!)).toContain(CategoriesController);
    expect(meta('imports', AppModule)).toContain(CategoriesModule);
  });

  describe('GET /api/categories (3.8)', () => {
    let app: INestApplication;
    let http: Awaited<ReturnType<typeof demarrer>>['http'];
    beforeAll(async () => {
      ({ app, http } = await demarrer());
    });
    afterAll(() => app.close());

    it('renvoie un tableau de noms de catégories', async () => {
      const r = await http().get('/api/categories').expect(200);
      expect(Array.isArray(r.body)).toBe(true);
      expect(r.body.length).toBeGreaterThan(0);
      expect(r.body.every((c: unknown) => typeof c === 'string')).toBe(true);
    });
  });

  it('3.9 · ProduitsService existe, est un provider de ProduitsModule et est injecté dans le controller', async () => {
    const { ProduitsService } = await importer<Fichier>('produits/produits.service', 'Génère-le avec `npx nest g service produits`.');
    const { ProduitsModule } = await importer<Fichier>('produits/produits.module', '');
    const { ProduitsController } = await importer<Fichier>('produits/produits.controller', '');
    expect(meta('providers', ProduitsModule!)).toContain(ProduitsService);
    expect(meta('design:paramtypes', ProduitsController!)).toContain(ProduitsService);
  });

  it('3.11 · categories() renvoie les catégories sans doublon', async () => {
    const { ProduitsService } = await importer<Fichier>('produits/produits.service', '');
    const service = new (ProduitsService as unknown as new () => { categories(): string[]; creer(p: object): unknown })();
    const liste = service.categories();
    expect(liste.length).toBeGreaterThan(0);
    expect(new Set(liste).size).toBe(liste.length);
  });

  it('3.11 · ProduitsModule exporte ProduitsService et CategoriesService l\'injecte', async () => {
    const { ProduitsService } = await importer<Fichier>('produits/produits.service', '');
    const { ProduitsModule } = await importer<Fichier>('produits/produits.module', '');
    const { CategoriesService } = await importer<Fichier>('categories/categories.service', 'Génère-le avec `npx nest g service categories`.');
    const { CategoriesModule } = await importer<Fichier>('categories/categories.module', '');
    expect(meta('exports', ProduitsModule!)).toContain(ProduitsService);
    expect(meta('imports', CategoriesModule!)).toContain(ProduitsModule);
    expect(meta('design:paramtypes', CategoriesService!)).toContain(ProduitsService);
  });

  describe('GET /api/categories (3.11)', () => {
    let app: INestApplication;
    let http: Awaited<ReturnType<typeof demarrer>>['http'];
    beforeAll(async () => {
      ({ app, http } = await demarrer());
    });
    afterAll(() => app.close());

    it('correspond aux catégories des produits, sans doublon', async () => {
      const produits = (await http().get('/api/produits')).body as { categorie: string }[];
      const attendues = [...new Set(produits.map((p) => p.categorie))].sort();
      const r = await http().get('/api/categories').expect(200);
      expect([...r.body].sort()).toEqual(attendues);
    });

    it('suit les produits créés', async () => {
      await http().post('/api/produits').send({ nom: 'Chaise', categorie: 'mobilier-test' }).expect(201);
      const r = await http().get('/api/categories').expect(200);
      expect(r.body).toContain('mobilier-test');
    });
  });
});
