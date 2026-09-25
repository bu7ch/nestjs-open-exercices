import { PrixService } from './prix.service.js';

describe('PrixService', () => {
  const prix = new PrixService();

  describe('calculerTotal', () => {
    // 6.1 : un cas par palier.
    it('facture 1 unité au plein tarif', () => {
      expect(prix.calculerTotal(100, 1)).toBe(100);
    });

    it('applique 10 % de remise à partir de 10 unités', () => {
      expect(prix.calculerTotal(100, 10)).toBe(900);
    });

    it('applique 20 % de remise à partir de 50 unités', () => {
      expect(prix.calculerTotal(100, 50)).toBe(4000);
    });

    // 6.2 : les bornes de chaque palier.
    it.each([
      [1, 100],
      [9, 900],
      [10, 900],
      [49, 4410],
      [50, 4000],
      [100, 8000],
    ])('%i unités à 100 € coûtent %i €', (quantite, attendu) => {
      expect(prix.calculerTotal(100, quantite)).toBe(attendu);
    });

    // 6.3 : le piège des décimales.
    it('arrondit le total au centime', () => {
      expect(prix.calculerTotal(0.7, 12)).toBe(7.56);
    });

    // 6.4 : les quantités qui n'ont pas de sens.
    it.each([0, -3, 2.5])('refuse la quantité %s', (quantite) => {
      expect(() => prix.calculerTotal(100, quantite)).toThrow('entier positif');
    });

    // 6.16 : le test paresseux. Il couvre toutes les lignes… et ne vérifie rien : il ne peut pas
    // échouer. Il n'est là que pour la démonstration ; ce sont les tests ci-dessus qui protègent.
    it('appelle calculerTotal dans tous ses cas (sans rien vérifier)', () => {
      prix.calculerTotal(100, 1);
      prix.calculerTotal(100, 10);
      prix.calculerTotal(100, 50);
      try {
        prix.calculerTotal(100, 0);
      } catch {
        // rien
      }
    });
  });
});
