import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreerProduitDto } from '../produits/dto/creer-produit.dto.js';
import { ProduitsService } from '../produits/produits.service.js';
import { CreerVendeurDto } from './dto/creer-vendeur.dto.js';
import { Vendeur } from './vendeur.entity.js';

@Injectable()
export class VendeursService {
  constructor(
    @InjectRepository(Vendeur) private readonly vendeurs: Repository<Vendeur>,
    private readonly produitsService: ProduitsService,
  ) {}

  trouverTous() {
    return this.vendeurs.find();
  }

  async trouverUn(id: number) {
    const vendeur = await this.vendeurs.findOne({ where: { id }, relations: { produits: true } });
    if (!vendeur) throw new NotFoundException(`Vendeur ${id} introuvable`);
    return vendeur;
  }

  async creer(dto: CreerVendeurDto, compteId?: number) {
    const vendeur = this.vendeurs.create({ ...dto, compte: compteId ? { id: compteId } : null });
    const { compte: _compte, ...cree } = await this.vendeurs.save(vendeur);
    return cree;
  }

  async renommer(id: number, nom: string) {
    const vendeur = await this.vendeurs.findOneBy({ id });
    if (!vendeur) throw new NotFoundException(`Vendeur ${id} introuvable`);
    vendeur.nom = nom;
    return this.vendeurs.save(vendeur);
  }

  async supprimer(id: number) {
    try {
      const resultat = await this.vendeurs.delete(id);
      if (resultat.affected === 0) throw new NotFoundException(`Vendeur ${id} introuvable`);
    } catch (erreur) {
      if (erreur instanceof QueryFailedError && (erreur.driverError as { code?: string }).code === '23503') {
        throw new ConflictException('Un produit de ce vendeur a été commandé : suppression impossible');
      }
      throw erreur;
    }
  }

  async ajouterProduit(id: number, dto: CreerProduitDto) {
    const vendeur = await this.vendeurs.findOneBy({ id });
    if (!vendeur) throw new NotFoundException(`Vendeur ${id} introuvable`);
    return this.produitsService.creer(dto, vendeur);
  }
}
