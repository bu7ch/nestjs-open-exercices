import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { QueryFailedError } from 'typeorm';
import { ComptesService } from '../comptes/comptes.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  const comptes = { creer: vi.fn(), trouverAvecMotDePasse: vi.fn(), definirRefreshToken: vi.fn() };
  const jwt = { signAsync: vi.fn() };
  // 7.15 : AuthService lit JWT_REFRESH_SECRET ; sans ce faux ConfigService, Nest ne peut pas le construire.
  const config = { get: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    config.get.mockReturnValue('un-secret-de-test-de-plus-de-32-caracteres');
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ComptesService, useValue: comptes },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('inscrire', () => {
    it('ne transmet jamais le mot de passe en clair, seulement son hachage', async () => {
      comptes.creer.mockResolvedValue({ id: 1, email: 'louve@exemple.fr' });

      await expect(service.inscrire({ email: 'louve@exemple.fr', motDePasse: 'MotDePasse!42' })).resolves.toEqual({ id: 1, email: 'louve@exemple.fr' });

      const [email, hache] = comptes.creer.mock.calls[0]!;
      expect(email).toBe('louve@exemple.fr');
      expect(hache).not.toBe('MotDePasse!42');
      expect(hache).toMatch(/^\$argon2id\$/);
      await expect(argon2.verify(hache, 'MotDePasse!42')).resolves.toBe(true);
    });

    it('renvoie 409 quand l\'email existe déjà', async () => {
      const doublon = new QueryFailedError('INSERT', [], Object.assign(new Error('doublon'), { code: '23505' }));
      comptes.creer.mockRejectedValue(doublon);

      await expect(service.inscrire({ email: 'louve@exemple.fr', motDePasse: 'MotDePasse!42' })).rejects.toThrow(ConflictException);
    });
  });

  describe('connecter', () => {
    it('donne le même refus pour un email inconnu et pour un mauvais mot de passe', async () => {
      comptes.trouverAvecMotDePasse.mockResolvedValueOnce(null);
      const inconnu = await service.connecter({ email: 'fantome@exemple.fr', motDePasse: 'faux' }).catch((e: unknown) => e);

      comptes.trouverAvecMotDePasse.mockResolvedValueOnce({ id: 1, email: 'louve@exemple.fr', role: 'acheteur', motDePasseHache: await argon2.hash('MotDePasse!42') });
      const mauvais = await service.connecter({ email: 'louve@exemple.fr', motDePasse: 'faux' }).catch((e: unknown) => e);

      expect(inconnu).toBeInstanceOf(UnauthorizedException);
      expect(mauvais).toBeInstanceOf(UnauthorizedException);
      expect((inconnu as Error).message).toBe((mauvais as Error).message);
    });

    it('signe un jeton d\'accès et un refresh token, et n\'enregistre que l\'empreinte du second', async () => {
      comptes.trouverAvecMotDePasse.mockResolvedValue({ id: 1, email: 'louve@exemple.fr', role: 'acheteur', motDePasseHache: await argon2.hash('MotDePasse!42') });
      jwt.signAsync.mockResolvedValueOnce('jeton-acces').mockResolvedValueOnce('jeton-refresh');

      await expect(service.connecter({ email: 'louve@exemple.fr', motDePasse: 'MotDePasse!42' })).resolves.toEqual({ accessToken: 'jeton-acces', refreshToken: 'jeton-refresh' });
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 1, email: 'louve@exemple.fr', role: 'acheteur' });
      const [id, empreinte] = comptes.definirRefreshToken.mock.calls[0]!;
      expect(id).toBe(1);
      await expect(argon2.verify(empreinte, 'jeton-refresh')).resolves.toBe(true);
    });
  });
});
