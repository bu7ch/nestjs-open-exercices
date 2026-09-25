import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LigneCommande } from '../commandes/ligne-commande.entity.js';
import { ApiErreurs } from '../commun/erreurs.js';
import { ApiPage, creerPage } from '../commun/page.js';
import { PaginationDto } from '../commun/pagination.dto.js';
import { LigneClassementVendeurDto } from './ligne-classement-vendeur.dto.js';

@ApiTags('classement')
@ApiBearerAuth()
@Controller('api/classement-vendeurs')
export class ClassementVendeursController {
  constructor(@InjectRepository(LigneCommande) private readonly lignes: Repository<LigneCommande>) {}

  // 9.12 : le classement n'est stocké nulle part : la base le calcule à partir des lignes de commande.
  @Get()
  @ApiOperation({ summary: 'Classement des vendeurs par chiffre d\'affaires, puis par nombre de commandes' })
  @ApiPage(LigneClassementVendeurDto)
  @ApiErreurs(400, 401)
  async classement(@Query() { page, limite }: PaginationDto) {
    const lignes = await this.lignes
      .createQueryBuilder('l')
      .innerJoin('l.commande', 'c')
      .innerJoin('l.variante', 'va')
      .innerJoin('va.produit', 'p')
      .innerJoin('p.vendeur', 'v')
      .select('v.id', 'vendeurId')
      .addSelect('v.nom', 'nom')
      // DISTINCT : une commande de deux lignes du même vendeur compte pour UNE commande.
      .addSelect('COUNT(DISTINCT c.id)::int', 'commandes')
      // `numeric` revient en texte ; arrondi au centime puis converti, pour un nombre dans le JSON.
      .addSelect('ROUND(SUM(l.quantite * p.prix), 2)::float8', 'chiffreAffaires')
      .groupBy('v.id')
      // Trois critères : chiffre d'affaires, puis commandes, puis identifiant (l'ordre est toujours le même).
      .orderBy('"chiffreAffaires"', 'DESC')
      .addOrderBy('commandes', 'DESC')
      .addOrderBy('v.id', 'ASC')
      .offset((page - 1) * limite)
      .limit(limite)
      .getRawMany<{ vendeurId: number; nom: string; commandes: number; chiffreAffaires: number }>();

    const total = await this.lignes
      .createQueryBuilder('l')
      .innerJoin('l.variante', 'va')
      .innerJoin('va.produit', 'p')
      .select('COUNT(DISTINCT p."vendeurId")::int', 'n')
      .getRawOne<{ n: number }>();

    const donnees = lignes.map((l, i) => ({ rang: (page - 1) * limite + i + 1, ...l }));
    return creerPage(donnees, total?.n ?? 0, page, limite);
  }
}
