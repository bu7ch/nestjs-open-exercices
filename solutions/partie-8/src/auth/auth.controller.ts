import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { CompteCourant } from './compte-courant.decorator.js';
import { ConnexionDto } from './dto/connexion.dto.js';
import { InscriptionDto } from './dto/inscription.dto.js';
import { RafraichirDto } from './dto/rafraichir.dto.js';
import { Public } from './public.decorator.js';
import type { CompteCourantDonnees } from './types.js';

// 7.18 : 5 tentatives par minute sur les routes sensibles (au lieu de 100 pour le reste).
const LIMITE_STRICTE = { default: { limit: 5, ttl: 60_000 } };

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(LIMITE_STRICTE)
  @Post('inscription')
  inscrire(@Body() dto: InscriptionDto) {
    return this.authService.inscrire(dto);
  }

  @Public()
  @Throttle(LIMITE_STRICTE)
  @Post('connexion')
  @HttpCode(200)
  connecter(@Body() dto: ConnexionDto) {
    return this.authService.connecter(dto);
  }

  @Get('moi')
  moi(@CompteCourant() compte: CompteCourantDonnees) {
    return this.authService.profil(compte.id);
  }

  @Public()
  @Throttle(LIMITE_STRICTE)
  @Post('rafraichir')
  @HttpCode(200)
  rafraichir(@Body() dto: RafraichirDto) {
    return this.authService.rafraichir(dto.refreshToken);
  }

  @Post('deconnexion')
  @HttpCode(204)
  async deconnecter(@CompteCourant() compte: CompteCourantDonnees) {
    await this.authService.deconnecter(compte.id);
  }
}
