import { Body, Controller, DefaultValuePipe, Get, Header, Param, ParseIntPipe, Patch, Post, Query, UseInterceptors, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompteCourant } from '../auth/compte-courant.decorator.js';
import type { CompteCourantDonnees } from '../auth/types.js';
import { CurseurDto } from '../commun/curseur.dto.js';
import { ApiErreurs } from '../commun/erreurs.js';
import { ApiPage } from '../commun/page.js';
import { CreerProduitDto } from './dto/creer-produit.dto.js';
import { CreerVarianteDto } from './dto/creer-variante.dto.js';
import { ListerProduitsDto } from './dto/lister-produits.dto.js';
import { ProduitReponseDto } from './dto/produit-reponse.dto.js';
import { RenommerProduitDto } from './dto/renommer-produit.dto.js';
import { MasquerPrixAchatInterceptor } from './interceptors/masquer-prix-achat.interceptor.js';
import { CategorieValidePipe } from './pipes/categorie-valide.pipe.js';
import { ProduitsService } from './produits.service.js';

@ApiTags('produits')
@ApiBearerAuth()
@Controller('api/produits')
export class ProduitsController {
  constructor(private readonly produits: ProduitsService) {}

  // 9.4 : l'ancienne version, sans numéro, gardée telle quelle ; 9.5 : annoncée comme obsolète.
  // 8.11 : le prix d'achat masqué, sauf pour le propriétaire et un admin.
  @Get()
  @ApiOperation({ summary: 'Liste les produits (ancienne version, sans pagination)', deprecated: true })
  @ApiOkResponse({ type: [ProduitReponseDto] })
  @ApiErreurs(400, 401)
  @Header('Deprecation', 'true')
  @Header('Sunset', 'Thu, 30 Sep 2027 23:59:59 GMT')
  @UseInterceptors(MasquerPrixAchatInterceptor)
  listerV1(
    @Query('categorie') categorie: string | undefined,
    @Query('limite', new DefaultValuePipe(10), ParseIntPipe) limite: number,
  ) {
    return this.produits.lister(categorie, limite);
  }

  // 9.4 puis 9.7, 9.10, 9.11 : la v2, paginée, filtrée et triée.
  @Version('2')
  @Get()
  @ApiOperation({ summary: 'Liste les produits actifs, paginés, filtrés et triés' })
  @ApiPage(ProduitReponseDto)
  @ApiErreurs(400, 401)
  @UseInterceptors(MasquerPrixAchatInterceptor)
  lister(@Query() q: ListerProduitsDto) {
    return this.produits.listerPage(q);
  }

  // 9.9 : déclarée AVANT `:id`, sinon `curseur` serait pris pour un identifiant (400 du ParseIntPipe).
  @Version('2')
  @Get('curseur')
  @ApiOperation({ summary: 'Parcourt les produits actifs par curseur (après un identifiant)' })
  @ApiErreurs(400, 401)
  @UseInterceptors(MasquerPrixAchatInterceptor)
  parCurseur(@Query() { apres, limite }: CurseurDto) {
    return this.produits.apresCurseur(apres, limite);
  }

  @Get('categorie/:categorie')
  @ApiOperation({ summary: 'Liste les produits d\'une catégorie' })
  @ApiErreurs(400, 401)
  trouverParCategorie(@Param('categorie', CategorieValidePipe) categorie: string) {
    return this.produits.lister(categorie);
  }

  // 9.6 : le détail vit dans les deux mondes : /api/produits/1 et /v2/api/produits/1 (pas /v1/…).
  @Version([VERSION_NEUTRAL, '2'])
  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un produit' })
  @ApiOkResponse({ type: ProduitReponseDto })
  @ApiErreurs(400, 401, 404)
  @UseInterceptors(MasquerPrixAchatInterceptor)
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.produits.trouver(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crée un produit' })
  creer(@Body() dto: CreerProduitDto) {
    return this.produits.creer(dto);
  }

  // 7.14 : le propriétaire (via son vendeur) ou un admin ; les autres reçoivent 403.
  @Patch(':id')
  @ApiOperation({ summary: 'Renomme un produit (son propriétaire ou un admin)' })
  @ApiErreurs(400, 401, 403, 404)
  renommer(@Param('id', ParseIntPipe) id: number, @Body() dto: RenommerProduitDto, @CompteCourant() compte: CompteCourantDonnees) {
    return this.produits.renommer(id, dto.nom, compte);
  }

  @Post(':id/variantes')
  @ApiOperation({ summary: 'Ajoute une variante à un produit' })
  ajouterVariante(@Param('id', ParseIntPipe) id: number, @Body() dto: CreerVarianteDto) {
    return this.produits.ajouterVariante(id, dto);
  }
}
