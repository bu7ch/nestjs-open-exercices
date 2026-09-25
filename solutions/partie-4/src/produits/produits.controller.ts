import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CreerProduitDto } from './dto/creer-produit.dto.js';
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
    return this.produits.lister(categorie).slice(0, limite);
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
}
