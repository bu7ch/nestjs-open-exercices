import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequeteAuthentifiee } from '../../auth/types.js';
import { VendeursService } from '../vendeurs.service.js';

// 8.8 : le compte connecté doit posséder le vendeur de la route (relation Vendeur → Compte, 7.14),
// ou être admin.
@Injectable()
export class ProprietaireVendeurGuard implements CanActivate {
  constructor(private readonly vendeurs: VendeursService) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    // 8.9 : `:vendeurId` n'est pas encore passé par le ParseIntPipe de la méthode.
    const id = Number(requete.params.vendeurId);
    if (!Number.isInteger(id) || !requete.compte) throw new BadRequestException('Identifiant de vendeur invalide');

    const vendeur = await this.vendeurs.trouverAvecCompte(id);
    if (!vendeur) throw new NotFoundException(`Vendeur ${id} introuvable`);
    if (requete.compte.role !== 'admin' && vendeur.compte?.id !== requete.compte.id) {
      throw new ForbiddenException('Ce vendeur ne t\'appartient pas');
    }
    return true;
  }
}
