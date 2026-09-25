import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Commande } from './commande.entity.js';
import { CreerCommandeDto } from './dto/creer-commande.dto.js';

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
}
