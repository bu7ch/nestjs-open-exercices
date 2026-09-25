import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Vendeur } from '../vendeurs/vendeur.entity.js';
import { CreerProduitDto } from './dto/creer-produit.dto.js';
import { CreerVarianteDto } from './dto/creer-variante.dto.js';
import { Produit } from './produit.entity.js';
import { Variante } from './variante.entity.js';

@Injectable()
export class ProduitsService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Produit) private readonly produits: Repository<Produit>,
    @InjectRepository(Variante) private readonly variantes: Repository<Variante>,
  ) {}

  lister(categorie?: string, limite?: number) {
    return this.produits.find({
      where: categorie ? { categorie } : {},
      order: { id: 'ASC' },
      take: limite,
    });
  }

  async trouver(id: number) {
    const produit = await this.produits.findOne({ where: { id }, relations: { variantes: true } });
    if (!produit) throw new NotFoundException(`Produit ${id} introuvable`);
    return produit;
  }

  async creer(dto: CreerProduitDto, vendeur?: Vendeur) {
    const maximum = this.config.get<number>('NOMBRE_MAX_PRODUITS');
    if (maximum !== undefined && (await this.produits.count()) >= Number(maximum)) {
      throw new BadRequestException(`Nombre maximum de produits atteint (${maximum})`);
    }
    const produit = this.produits.create({ ...dto, vendeur });
    return this.produits.save(produit);
  }

  async ajouterVariante(id: number, dto: CreerVarianteDto) {
    const produit = await this.produits.findOneBy({ id });
    if (!produit) throw new NotFoundException(`Produit ${id} introuvable`);
    const variante = this.variantes.create({ ...dto, produit });
    return this.variantes.save(variante);
  }

  async categories(): Promise<string[]> {
    const produits = await this.produits.find({ select: { categorie: true } });
    return [...new Set(produits.map((p) => p.categorie))];
  }
}
