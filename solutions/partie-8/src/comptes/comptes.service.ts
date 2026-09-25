import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Compte } from './compte.entity.js';

@Injectable()
export class ComptesService {
  constructor(@InjectRepository(Compte) private readonly comptes: Repository<Compte>) {}

  creer(email: string, motDePasseHache: string) {
    return this.comptes.save(this.comptes.create({ email, motDePasseHache }));
  }

  // La seule méthode qui demande l'empreinte du mot de passe : pour la connexion.
  trouverAvecMotDePasse(email: string) {
    return this.comptes.findOne({
      where: { email },
      select: { id: true, email: true, role: true, motDePasseHache: true },
    });
  }

  trouverParId(id: number) {
    return this.comptes.findOneBy({ id });
  }

  lister() {
    return this.comptes.find({ order: { id: 'ASC' } });
  }

  definirRefreshToken(id: number, hache: string | null) {
    return this.comptes.update(id, { refreshTokenHache: hache });
  }

  trouverAvecRefreshToken(id: number) {
    return this.comptes.findOne({
      where: { id },
      select: { id: true, email: true, role: true, refreshTokenHache: true },
    });
  }
}
