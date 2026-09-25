import { ParseIntPipe } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { VendeursService } from '../vendeurs/vendeurs.service.js';
import { CreerVendeurInput } from './creer-vendeur.input.js';
import { VendeurType } from './vendeur.type.js';

@Resolver(() => VendeurType)
export class VendeursResolver {
  constructor(private readonly vendeursService: VendeursService) {}

  @Query(() => [VendeurType])
  vendeurs() {
    return this.vendeursService.trouverTous();
  }

  @Query(() => VendeurType)
  vendeur(@Args('id', { type: () => ID }, ParseIntPipe) id: number) {
    return this.vendeursService.trouverUn(id);
  }

  @Mutation(() => VendeurType)
  async creerVendeur(@Args('entree') entree: CreerVendeurInput) {
    const vendeur = await this.vendeursService.creer({ nom: entree.nom });
    return { ...vendeur, produits: [] };
  }
}
