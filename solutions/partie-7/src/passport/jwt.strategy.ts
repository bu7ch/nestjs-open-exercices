import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { PayloadJwt } from '../auth/types.js';

// Bonus 7.21 : la vérification du jeton, à la façon de Passport (une « stratégie »).
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // `getOrThrow` : sans secret, l'application refuse de démarrer.
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Appelée seulement si le jeton est valide ; le résultat devient `request.user`.
  validate(payload: PayloadJwt) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
