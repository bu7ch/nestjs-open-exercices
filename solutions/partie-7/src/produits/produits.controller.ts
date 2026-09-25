import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CompteCourant } from '../auth/compte-courant.decorator.js';
import type { CompteCourantDonnees } from '../auth/types.js';
import { CreerProduitDto } from './dto/creer-produit.dto.js';
import { CreerVarianteDto } from './dto/creer-variante.dto.js';
import { RenommerProduitDto } from './dto/renommer-produit.dto.js';
import { CategorieValidePipe } from './pipes/categorie-valide.pipe.js';
import { ProduitsService } from './produits.service.js';

@Controller('api/produits')
export class ProduitsController {
  constructor(private readonly produits: ProduitsService) {}

  @Get()
  lister(
    @Query('categorie') categorie: string | undefined,
    @Query('limite', new DefaultValuePipe(10), ParseIntPipe) limite: number,
  ) {
    return this.produits.lister(categorie, limite);
  }

  @Get('categorie/:categorie')
  trouverParCategorie(@Param('categorie', CategorieValidePipe) categorie: string) {
    return this.produits.lister(categorie);
  }

  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.produits.trouver(id);
  }

  @Post()
  creer(@Body() dto: CreerProduitDto) {
    return this.produits.creer(dto);
  }

  // 7.14 : le propriétaire (via son vendeur) ou un admin ; les autres reçoivent 403.
  @Patch(':id')
  renommer(@Param('id', ParseIntPipe) id: number, @Body() dto: RenommerProduitDto, @CompteCourant() compte: CompteCourantDonnees) {
    return this.produits.renommer(id, dto.nom, compte);
  }

  @Post(':id/variantes')
  ajouterVariante(@Param('id', ParseIntPipe) id: number, @Body() dto: CreerVarianteDto) {
    return this.produits.ajouterVariante(id, dto);
  }
}
