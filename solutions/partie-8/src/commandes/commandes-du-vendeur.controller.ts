import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ProprietaireVendeurGuard } from '../vendeurs/guards/proprietaire-vendeur.guard.js';
import { CommandesService } from './commandes.service.js';

// 8.8 : chaque vendeur ne voit que SES commandes (un admin voit celles de tous).
@Controller('api/vendeurs/:vendeurId/commandes')
export class CommandesDuVendeurController {
  constructor(private readonly commandesService: CommandesService) {}

  @Get()
  @UseGuards(ProprietaireVendeurGuard)
  lister(@Param('vendeurId', ParseIntPipe) vendeurId: number) {
    return this.commandesService.parVendeur(vendeurId);
  }
}
