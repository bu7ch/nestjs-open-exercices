import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator.js';
import { ComptesService } from './comptes.service.js';

@ApiTags('comptes')
@ApiBearerAuth()
@Controller('api/comptes')
export class ComptesController {
  constructor(private readonly comptesService: ComptesService) {}

  // 7.12 : réservé aux administrateurs. Les empreintes ne sont pas chargées (`select: false`).
  @Roles('admin')
  @Get()
  lister() {
    return this.comptesService.lister();
  }
}
