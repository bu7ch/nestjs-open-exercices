import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { EST_PUBLIC } from './public.decorator.js';
import type { PayloadJwt, RequeteAuthentifiee } from './types.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const estPublic = this.reflector.getAllAndOverride<boolean>(EST_PUBLIC, [contexte.getHandler(), contexte.getClass()]);
    if (estPublic) return true;

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const [type, jeton] = requete.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !jeton) throw new UnauthorizedException('Jeton manquant');

    try {
      // Vérifie la signature ET l'expiration (avec JWT_SECRET, le secret de JwtModule).
      const payload = await this.jwt.verifyAsync<PayloadJwt>(jeton);
      requete.compte = { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }
    return true;
  }
}
