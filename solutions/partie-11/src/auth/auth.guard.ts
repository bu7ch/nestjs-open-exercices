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
    // 11.1 : le guard global s'applique aussi aux gateways (getType() vaut alors 'ws'), dont les
    // événements n'ont pas d'en-têtes : un socket est authentifié une fois, à la connexion (11.4).
    if (contexte.getType() !== 'http') return true;

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
