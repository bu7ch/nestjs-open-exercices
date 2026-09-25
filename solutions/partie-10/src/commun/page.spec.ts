import { creerPage } from './page.js';

// 9.7 : la petite fonction de la pagination, sans aucune base.
describe('creerPage', () => {
  it('57 éléments par 20 : 3 pages (2,85 arrondi vers le haut)', () => {
    expect(creerPage([], 57, 1, 20).meta).toEqual({ page: 1, limite: 20, total: 57, totalPages: 3 });
  });

  it('60 éléments par 20 : exactement 3 pages', () => {
    expect(creerPage([], 60, 3, 20).meta.totalPages).toBe(3);
  });

  it('aucun élément : 0 page', () => {
    expect(creerPage([], 0, 1, 20).meta.totalPages).toBe(0);
  });

  it('garde les données telles quelles', () => {
    expect(creerPage([{ id: 1 }], 1, 1, 20).donnees).toEqual([{ id: 1 }]);
  });
});
