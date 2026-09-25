import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CreerJoueurDto } from './dto/creer-joueur.dto.js';
import { JoueursService } from './joueurs.service.js';
import { PosteValidePipe } from './pipes/poste-valide.pipe.js';

@Controller('api/joueurs')
export class JoueursController {
  constructor(private readonly joueursService: JoueursService) {}

  @Get()
  trouverTous(@Query('limite', new DefaultValuePipe(5), ParseIntPipe) limite: number) {
    return this.joueursService.trouverTous(limite);
  }

  @Get('poste/:poste')
  trouverParPoste(@Param('poste', PosteValidePipe) poste: string) {
    return this.joueursService.trouverParPoste(poste);
  }

  @Get(':id')
  trouverUn(@Param('id', ParseIntPipe) id: number) {
    return this.joueursService.trouverUn(id);
  }

  @Post()
  creer(@Body() dto: CreerJoueurDto) {
    return this.joueursService.creer(dto);
  }
}
