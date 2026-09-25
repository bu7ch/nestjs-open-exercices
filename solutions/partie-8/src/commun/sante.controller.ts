import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';

// 8.6 : une route publique, exclue du middleware d'identifiant de requête.
@Controller('sante')
export class SanteController {
  @Public()
  @Get()
  verifier() {
    return { statut: 'ok' };
  }
}
