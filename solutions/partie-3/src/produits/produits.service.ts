import { Injectable, NotFoundException } from '@nestjs/common';

export interface Produit {
  id: number;
  nom: string;
  categorie: string;
}

@Injectable()
export class ProduitsService {
  private produits: Produit[] = [
    { id: 1, nom: 'Stylo bleu', categorie: 'papeterie' },
    { id: 2, nom: 'Cahier A5', categorie: 'papeterie' },
    { id: 3, nom: 'Souris sans fil', categorie: 'informatique' },
  ];

  lister(categorie?: string): Produit[] {
    return categorie ? this.produits.filter((p) => p.categorie === categorie) : this.produits;
  }

  trouver(id: number): Produit {
    const produit = this.produits.find((p) => p.id === id);
    if (!produit) throw new NotFoundException(`Produit ${id} introuvable`);
    return produit;
  }

  creer(donnees: { nom: string; categorie: string }): Produit {
    const produit = { id: Math.max(0, ...this.produits.map((p) => p.id)) + 1, ...donnees };
    this.produits.push(produit);
    return produit;
  }

  categories(): string[] {
    return [...new Set(this.produits.map((p) => p.categorie))];
  }
}
