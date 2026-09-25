import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProduitsService } from './produits.service.js';

@Controller('api/produits')
export class ProduitsController {
  constructor(private readonly produits: ProduitsService) {}

  @Get()
  lister(@Query('categorie') categorie?: string) {
    return this.produits.lister(categorie);
  }

  @Get(':id')
  trouver(@Param('id') id: string) {
    return this.produits.trouver(Number(id));
  }

  @Post()
  creer(@Body() donnees: { nom: string; categorie: string }) {
    return this.produits.creer(donnees);
  }
}
