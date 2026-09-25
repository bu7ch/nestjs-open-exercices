import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreerProduitDto } from './dto/creer-produit.dto.js';

export interface Produit {
  id: number;
  nom: string;
  prix: number;
  categorie: string;
  variantes?: string[];
}

@Injectable()
export class ProduitsService {
  constructor(private readonly config: ConfigService) {}

  private produits: Produit[] = [
    { id: 1, nom: 'Stylo bleu', prix: 2, categorie: 'papeterie' },
    { id: 2, nom: 'Cahier A5', prix: 4, categorie: 'papeterie' },
    { id: 3, nom: 'Souris sans fil', prix: 25, categorie: 'informatique' },
  ];

  lister(categorie?: string): Produit[] {
    return categorie ? this.produits.filter((p) => p.categorie === categorie) : this.produits;
  }

  trouver(id: number): Produit {
    const produit = this.produits.find((p) => p.id === id);
    if (!produit) throw new NotFoundException(`Produit ${id} introuvable`);
    return produit;
  }

  creer(dto: CreerProduitDto): Produit {
    const maximum = this.config.get<number>('NOMBRE_MAX_PRODUITS');
    if (maximum !== undefined && this.produits.length >= Number(maximum)) {
      throw new BadRequestException(`Nombre maximum de produits atteint (${maximum})`);
    }
    const produit = { id: Math.max(0, ...this.produits.map((p) => p.id)) + 1, ...dto };
    this.produits.push(produit);
    return produit;
  }

  categories(): string[] {
    return [...new Set(this.produits.map((p) => p.categorie))];
  }
}
