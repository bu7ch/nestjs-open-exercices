import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { EquipesService } from './equipes.service.js';

@Controller('api/equipes')
export class EquipesController {
  constructor(private readonly equipesService: EquipesService) {}

  @Get()
  trouverTous() {
    return this.equipesService.trouverTous();
  }

  @Get(':id')
  trouverUne(@Param('id', ParseIntPipe) id: number) {
    const equipe = this.equipesService.trouverUne(id);
    if (!equipe) throw new NotFoundException(`Équipe ${id} introuvable`);
    return equipe;
  }
}
