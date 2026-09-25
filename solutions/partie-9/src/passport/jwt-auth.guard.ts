import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { EST_PUBLIC } from '../auth/public.decorator.js';

// Bonus 7.22 : le guard de Passport, qui respecte aussi @Public() (sécurisé par défaut).
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(contexte: ExecutionContext) {
    const estPublic = this.reflector.getAllAndOverride<boolean>(EST_PUBLIC, [contexte.getHandler(), contexte.getClass()]);
    return estPublic ? true : super.canActivate(contexte);
  }
}
