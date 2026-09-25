import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Role } from '../comptes/compte.entity.js';
import { ComptesService } from '../comptes/comptes.service.js';
import { ConnexionDto } from './dto/connexion.dto.js';
import { InscriptionDto } from './dto/inscription.dto.js';

@Injectable()
export class AuthService {
  // 7.6 : une empreinte factice, vérifiée quand l'email est inconnu, pour que la réponse prenne le
  // même temps que pour un vrai compte (sinon, le chronomètre dit quels emails existent).
  private readonly hacheFactice = argon2.hash('mot de passe factice');

  constructor(
    private readonly comptes: ComptesService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async inscrire(dto: InscriptionDto) {
    const motDePasseHache = await argon2.hash(dto.motDePasse);
    // 8.15 : un email déjà inscrit viole l'unicité (23505) : ToutesExceptionsFilter en fait un 409.
    const compte = await this.comptes.creer(dto.email, motDePasseHache);
    return { id: compte.id, email: compte.email };
  }

  async connecter(dto: ConnexionDto) {
    const compte = await this.comptes.trouverAvecMotDePasse(dto.email);
    const hache = compte?.motDePasseHache ?? (await this.hacheFactice);
    const valide = await argon2.verify(hache, dto.motDePasse);
    if (!compte || !valide) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    return this.emettreJetons(compte);
  }

  async profil(id: number) {
    const compte = await this.comptes.trouverParId(id);
    if (!compte) throw new UnauthorizedException('Compte introuvable');
    return { id: compte.id, email: compte.email, role: compte.role };
  }

  async rafraichir(refreshToken: string) {
    const invalide = new UnauthorizedException('Jeton de rafraîchissement invalide');
    let payload: { sub: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub: number }>(refreshToken, { secret: this.config.get<string>('JWT_REFRESH_SECRET') });
    } catch {
      throw invalide;
    }

    const compte = await this.comptes.trouverAvecRefreshToken(payload.sub);
    if (!compte?.refreshTokenHache || !(await argon2.verify(compte.refreshTokenHache, refreshToken))) {
      // 7.16 : un ancien refresh token présenté à nouveau ? Peut-être volé : on révoque la session.
      if (compte) await this.comptes.definirRefreshToken(compte.id, null);
      throw invalide;
    }
    return this.emettreJetons(compte);
  }

  async deconnecter(id: number) {
    await this.comptes.definirRefreshToken(id, null);
  }

  private async emettreJetons(compte: { id: number; email: string; role: Role }) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ sub: compte.id, email: compte.email, role: compte.role }),
      this.jwt.signAsync(
        { sub: compte.id },
        // 7.17 : `jwtid` rend chaque refresh token unique, même émis dans la même seconde.
        { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: '7d', jwtid: randomUUID() },
      ),
    ]);
    // On ne garde que l'empreinte : voler la base ne donne aucun refresh token utilisable.
    await this.comptes.definirRefreshToken(compte.id, await argon2.hash(refreshToken));
    return { accessToken, refreshToken };
  }
}
