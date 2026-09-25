import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CommandesService } from './commandes.service.js';
import { CreerCommandeDto } from './dto/creer-commande.dto.js';
import { StatutRequis } from './guards/statut.decorator.js';
import { StatutGuard } from './guards/statut.guard.js';

@ApiTags('commandes')
@ApiBearerAuth()
@Controller('api/commandes')
export class CommandesController {
  constructor(private readonly commandesService: CommandesService) {}

  @Post()
  creer(@Body() dto: CreerCommandeDto) {
    return this.commandesService.creer(dto);
  }

  @Get(':id')
  trouverUne(@Param('id', ParseIntPipe) id: number) {
    return this.commandesService.trouverUne(id);
  }

  // 8.7 : on n'expédie qu'une commande payée.
  @Post(':id/expedier')
  @HttpCode(200)
  @StatutRequis('payee')
  @UseGuards(StatutGuard)
  expedier(@Param('id', ParseIntPipe) id: number) {
    return this.commandesService.expedier(id);
  }
}
