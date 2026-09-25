import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompteCourant } from '../auth/compte-courant.decorator.js';
import type { CompteCourantDonnees } from '../auth/types.js';
import { CommandesGateway } from '../temps-reel/commandes.gateway.js';
import { CommandesService } from './commandes.service.js';
import { CreerCommandeDto } from './dto/creer-commande.dto.js';
import { StatutRequis } from './guards/statut.decorator.js';
import { StatutGuard } from './guards/statut.guard.js';

@ApiTags('commandes')
@ApiBearerAuth()
@Controller('api/commandes')
export class CommandesController {
  constructor(
    private readonly commandesService: CommandesService,
    private readonly gateway: CommandesGateway,
  ) {}

  // 11.1 : chaque vendeur concerné l'apprend en direct ; 11.5 : l'acheteur est le compte du jeton.
  @Post()
  async creer(@Body() dto: CreerCommandeDto, @CompteCourant() compte: CompteCourantDonnees) {
    const commande = await this.commandesService.creer(dto, compte.id);
    this.gateway.notifierCreation(await this.commandesService.decouperParVendeur(commande.id));
    return commande;
  }

  @Get(':id')
  trouverUne(@Param('id', ParseIntPipe) id: number) {
    return this.commandesService.trouverUne(id);
  }

  // 8.7 : on n'expédie qu'une commande payée ; 11.5 : l'acheteur en est prévenu.
  @Post(':id/expedier')
  @HttpCode(200)
  @StatutRequis('payee')
  @UseGuards(StatutGuard)
  async expedier(@Param('id', ParseIntPipe) id: number) {
    const { commande, acheteurId } = await this.commandesService.expedier(id);
    if (acheteurId) this.gateway.notifierStatut(acheteurId, commande.id, commande.statut);
    return commande;
  }
}
