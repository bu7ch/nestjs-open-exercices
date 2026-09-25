import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { echapperLike } from '../commun/echapper-like.js';
import { creerPage } from '../commun/page.js';
import type { CompteCourantDonnees } from '../auth/types.js';
import type { Vendeur } from '../vendeurs/vendeur.entity.js';
import { CreerProduitDto } from './dto/creer-produit.dto.js';
import { CreerVarianteDto } from './dto/creer-variante.dto.js';
import { COLONNES_DE_TRI, ListerProduitsDto } from './dto/lister-produits.dto.js';
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
      // 8.11 : le compte du vendeur, pour que l'interceptor sache qui est le propriétaire.
      relations: { vendeur: { compte: true } },
      order: { id: 'ASC' },
      take: limite,
    });
  }

  // 9.7, 9.10, 9.11 : la liste de la v2, filtrée, triée et paginée (seulement les produits actifs).
  async listerPage(q: ListerProduitsDto) {
    if (q.prixMin !== undefined && q.prixMax !== undefined && q.prixMin > q.prixMax) {
      throw new BadRequestException('prixMin ne peut pas dépasser prixMax');
    }
    const requete = this.produits
      .createQueryBuilder('p')
      // 8.11 : le compte du vendeur, pour que l'interceptor sache qui est le propriétaire.
      .leftJoinAndSelect('p.vendeur', 'vendeur')
      .leftJoinAndSelect('vendeur.compte', 'compte')
      .where('p.actif = true');
    if (q.categorie) requete.andWhere('p.categorie = :categorie', { categorie: q.categorie });
    // Les bornes arrivent en centimes ; la colonne `prix` est en euros (partie 5).
    if (q.prixMin !== undefined) requete.andWhere('p.prix * 100 >= :prixMin', { prixMin: q.prixMin });
    if (q.prixMax !== undefined) requete.andWhere('p.prix * 100 <= :prixMax', { prixMax: q.prixMax });
    if (q.recherche) requete.andWhere("p.nom ILIKE :motif ESCAPE '\\'", { motif: `%${echapperLike(q.recherche)}%` });

    requete.orderBy(COLONNES_DE_TRI[q.tri], q.ordre === 'asc' ? 'ASC' : 'DESC');
    // Le départage : sans le `if`, `id ASC` écraserait un `?tri=id&ordre=desc` (une direction par colonne).
    if (q.tri !== 'id') requete.addOrderBy('p.id', 'ASC');

    const [donnees, total] = await requete
      .skip((q.page - 1) * q.limite)
      .take(q.limite)
      .getManyAndCount();
    return creerPage(donnees, total, q.page, q.limite);
  }

  // 9.9 : la pagination par curseur : un élément de trop pour savoir s'il reste une suite.
  async apresCurseur(apres: number, limite: number) {
    const lignes = await this.produits.find({
      where: { id: MoreThan(apres), actif: true },
      relations: { vendeur: { compte: true } },
      order: { id: 'ASC' },
      take: limite + 1,
    });
    const suite = lignes.length > limite;
    const donnees = suite ? lignes.slice(0, limite) : lignes;
    return { donnees, curseurSuivant: suite ? donnees[donnees.length - 1]!.id : null };
  }

  async trouver(id: number) {
    const produit = await this.produits.findOne({ where: { id }, relations: { variantes: true, vendeur: { compte: true } } });
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

  async renommer(id: number, nom: string, compte: CompteCourantDonnees) {
    const produit = await this.produits.findOne({ where: { id }, relations: { vendeur: { compte: true } } });
    if (!produit) throw new NotFoundException(`Produit ${id} introuvable`);
    const proprietaire = produit.vendeur?.compte?.id;
    if (compte.role !== 'admin' && proprietaire !== compte.id) {
      throw new ForbiddenException('Ce produit ne t\'appartient pas');
    }
    produit.nom = nom;
    const { vendeur: _vendeur, ...renomme } = await this.produits.save(produit);
    return renomme;
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
