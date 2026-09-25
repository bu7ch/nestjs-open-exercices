import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { Request } from 'express';
import type { ProfilClerk } from './profil-clerk.entity.js';
import { ProfilsService } from './profils.service.js';

export type RequeteClerk = Request & { profil?: ProfilClerk };

// Bonus 7.25 : Clerk authentifie ; l'API ne fait que vérifier le jeton (RS256, clé publique).
@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly profils: ProfilsService,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const requete = contexte.switchToHttp().getRequest<RequeteClerk>();
    const [type, jeton] = requete.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !jeton) throw new UnauthorizedException('Jeton manquant');

    let clerkId: string;
    try {
      const payload = await verifyToken(jeton, {
        secretKey: this.config.get<string>('CLERK_SECRET_KEY'),
        jwtKey: this.config.get<string>('CLERK_JWT_KEY'),
        authorizedParties: this.config.getOrThrow<string>('CLERK_AUTHORIZED_PARTIES').split(','),
      });
      clerkId = payload.sub;
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }

    requete.profil = await this.profils.trouverOuCreer(clerkId);
    return true;
  }
}
