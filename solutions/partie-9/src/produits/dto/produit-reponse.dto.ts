import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 9.2 : la réponse est un CONTRAT avec les clients ; l'entité Produit, un détail de la base.
export class ProduitReponseDto {
  @ApiProperty({ description: 'Identifiant du produit', example: 12 })
  id: number;

  @ApiProperty({ description: 'Nom affiché du produit', example: 'Lampe de bureau' })
  nom: string;

  // La marketplace stocke le prix en euros, dans une colonne `numeric` (partie 5) : PostgreSQL le renvoie
  // sous forme de texte, pour ne rien perdre en précision. (La consigne du 9.2 parle de centimes : voir le README.)
  @ApiProperty({ description: 'Prix unitaire en euros, deux décimales (texte, pour ne rien perdre en précision)', type: String, example: '30.00' })
  prix: string;

  @ApiProperty({ description: 'Catégorie du produit', enum: ['papeterie', 'informatique', 'mobilier'], example: 'mobilier' })
  categorie: string;

  @ApiProperty({ description: 'Faux si le produit est retiré de la vente', example: true })
  actif: boolean;

  @ApiPropertyOptional({ description: 'Prix d\'achat : visible seulement du vendeur propriétaire et d\'un admin (8.11)', type: String, example: '18.00', nullable: true })
  prixAchat?: string | null;
}
