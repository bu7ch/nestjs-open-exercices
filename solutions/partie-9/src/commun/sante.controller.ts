import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';

// 8.6 : une route publique, exclue du middleware d'identifiant de requête.
@ApiTags('sante')
@Controller('sante')
export class SanteController {
  @Public()
  @Get()
  verifier() {
    return { statut: 'ok' };
  }
}
