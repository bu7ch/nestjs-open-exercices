import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompteCourant } from '../auth/compte-courant.decorator.js';
import type { CompteCourantDonnees } from '../auth/types.js';
import { ProprietaireVendeurGuard } from '../vendeurs/guards/proprietaire-vendeur.guard.js';
import { ImporterCatalogueDto } from './dto/importer-catalogue.dto.js';
import { ImportsService } from './imports.service.js';

// Bonus 11.10 : le travail lent (créer des centaines de produits) sort de la requête.
@ApiTags('imports')
@ApiBearerAuth()
@Controller('api')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  // 202 Accepted : « c'est noté, ce sera fait » (et non 201 : rien n'est encore créé).
  @Post('vendeurs/:vendeurId/imports')
  @HttpCode(202)
  @UseGuards(ProprietaireVendeurGuard)
  importer(@Param('vendeurId', ParseIntPipe) vendeurId: number, @Body() dto: ImporterCatalogueDto) {
    return this.imports.demander(vendeurId, dto.csv);
  }

  @Get('imports/:importId')
  etat(@Param('importId') importId: string, @CompteCourant() compte: CompteCourantDonnees) {
    return this.imports.etat(importId, compte);
  }
}
