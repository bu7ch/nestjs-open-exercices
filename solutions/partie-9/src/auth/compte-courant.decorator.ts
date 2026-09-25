import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequeteAuthentifiee } from './types.js';

// 7.9 : l'identité rangée sur la requête par AuthGuard.
export const CompteCourant = createParamDecorator((_donnees: unknown, contexte: ExecutionContext) => {
  return contexte.switchToHttp().getRequest<RequeteAuthentifiee>().compte;
});
