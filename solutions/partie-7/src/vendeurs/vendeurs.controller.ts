import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CompteCourant } from '../auth/compte-courant.decorator.js';
import type { CompteCourantDonnees } from '../auth/types.js';
import { CreerProduitDto } from '../produits/dto/creer-produit.dto.js';
import { CreerVendeurDto } from './dto/creer-vendeur.dto.js';
import { VendeursService } from './vendeurs.service.js';

@Controller('api/vendeurs')
export class VendeursController {
  constructor(private readonly vendeursService: VendeursService) {}

  @Get()
  trouverTous() {
    return this.vendeursService.trouverTous();
  }

  @Get(':id')
  trouverUn(@Param('id', ParseIntPipe) id: number) {
    return this.vendeursService.trouverUn(id);
  }

  @Post()
  creer(@Body() dto: CreerVendeurDto, @CompteCourant() compte: CompteCourantDonnees) {
    // 7.14 : le vendeur appartient au compte connecté (jamais à un compte désigné dans le corps).
    return this.vendeursService.creer(dto, compte.id);
  }

  @Patch(':id')
  renommer(@Param('id', ParseIntPipe) id: number, @Body() dto: CreerVendeurDto) {
    return this.vendeursService.renommer(id, dto.nom);
  }

  @Delete(':id')
  @HttpCode(204)
  async supprimer(@Param('id', ParseIntPipe) id: number) {
    await this.vendeursService.supprimer(id);
  }

  @Post(':id/produits')
  ajouterProduit(@Param('id', ParseIntPipe) id: number, @Body() dto: CreerProduitDto) {
    return this.vendeursService.ajouterProduit(id, dto);
  }
}
