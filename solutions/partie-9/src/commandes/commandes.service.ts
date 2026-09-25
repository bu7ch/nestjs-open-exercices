import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Commande } from './commande.entity.js';
import { CreerCommandeDto } from './dto/creer-commande.dto.js';
import { transitionner } from './transitions.js';

@Injectable()
export class CommandesService {
  constructor(@InjectRepository(Commande) private readonly commandes: Repository<Commande>) {}

  creer(dto: CreerCommandeDto) {
    const commande = this.commandes.create({
      lignes: dto.lignes.map((ligne) => ({ quantite: ligne.quantite, variante: { id: ligne.varianteId } })),
    });
    return this.commandes.save(commande);
  }

  async trouverUne(id: number) {
    const commande = await this.commandes.findOne({
      where: { id },
      relations: { lignes: { variante: { produit: true } } },
    });
    if (!commande) throw new NotFoundException(`Commande ${id} introuvable`);
    return commande;
  }

  // 8.7 : ce dont le guard de statut a besoin, sans charger les lignes.
  trouverSansLignes(id: number) {
    return this.commandes.findOneBy({ id });
  }

  async expedier(id: number) {
    const commande = await this.commandes.findOneBy({ id });
    if (!commande) throw new NotFoundException(`Commande ${id} introuvable`);
    commande.statut = transitionner(commande.statut, 'expediee');
    return this.commandes.save(commande);
  }

  // 8.8 : les commandes qui contiennent un produit de ce vendeur (et seulement ses lignes à lui).
  parVendeur(vendeurId: number) {
    return this.commandes.find({
      where: { lignes: { variante: { produit: { vendeur: { id: vendeurId } } } } },
      relations: { lignes: { variante: { produit: true } } },
      order: { id: 'ASC' },
    });
  }
}
