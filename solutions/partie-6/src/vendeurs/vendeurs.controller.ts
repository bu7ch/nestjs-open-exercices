import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
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
  creer(@Body() dto: CreerVendeurDto) {
    return this.vendeursService.creer(dto);
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
