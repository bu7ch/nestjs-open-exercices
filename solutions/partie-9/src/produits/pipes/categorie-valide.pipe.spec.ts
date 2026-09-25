import { BadRequestException } from '@nestjs/common';
import { CategorieValidePipe } from './categorie-valide.pipe.js';

// 6.15 : categorie-valide.pipe.ts apparaissait à 0 % une fois tous les fichiers comptés.
describe('CategorieValidePipe', () => {
  const pipe = new CategorieValidePipe();

  it('laisse passer une catégorie connue', () => {
    expect(pipe.transform('papeterie')).toBe('papeterie');
  });

  it('refuse une catégorie inconnue avec un 400', () => {
    expect(() => pipe.transform('jardinage')).toThrow(BadRequestException);
  });
});
