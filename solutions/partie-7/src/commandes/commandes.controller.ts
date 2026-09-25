import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CommandesService } from './commandes.service.js';
import { CreerCommandeDto } from './dto/creer-commande.dto.js';

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
}
