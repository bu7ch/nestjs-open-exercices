import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { ComptesService } from './comptes.service.js';

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
