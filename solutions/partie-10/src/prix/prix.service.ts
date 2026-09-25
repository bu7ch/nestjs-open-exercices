import { Injectable } from '@nestjs/common';

@Injectable()
export class PrixService {
  /** Le prix d'une commande : plein tarif de 1 à 9 unités, -10 % de 10 à 49, -20 % à partir de 50. */
  calculerTotal(prixUnitaire: number, quantite: number): number {
    // 6.4 : une quantité doit être un entier d'au moins 1.
    if (!Number.isInteger(quantite) || quantite < 1) {
      throw new Error(`La quantité doit être un entier positif (reçu : ${quantite})`);
    }
    const remise = quantite >= 50 ? 0.2 : quantite >= 10 ? 0.1 : 0;
    // 6.3 : arrondi au centime (0,70 € × 12 donnerait sinon 7.559999999999999).
    return Math.round(prixUnitaire * quantite * (1 - remise) * 100) / 100;
  }
}
