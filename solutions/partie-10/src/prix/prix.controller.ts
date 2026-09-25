import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CalculerTotalDto } from './dto/calculer-total.dto.js';
import { PrixService } from './prix.service.js';

@ApiTags('prix')
@ApiBearerAuth()
@Controller('api/prix')
export class PrixController {
  constructor(private readonly prix: PrixService) {}

  @Post('total')
  total(@Body() dto: CalculerTotalDto) {
    return { total: this.prix.calculerTotal(dto.prixUnitaire, dto.quantite) };
  }
}
