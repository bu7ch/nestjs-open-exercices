import { Injectable } from '@nestjs/common';
import { ProduitsService } from '../produits/produits.service.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly produits: ProduitsService) {}

  lister(): Promise<string[]> {
    return this.produits.categories();
  }
}
