import { ApiProperty } from '@nestjs/swagger';

// 9.12 : une ligne CALCULÉE (pas une entité) : ce que renvoie la requête d'agrégation.
export class LigneClassementVendeurDto {
  @ApiProperty({ description: 'Position dans le classement, à partir de 1', example: 1 }) rang: number;
  @ApiProperty({ description: 'Identifiant du vendeur', example: 3 }) vendeurId: number;
  @ApiProperty({ description: 'Nom du vendeur', example: 'Atelier du Bois' }) nom: string;
  @ApiProperty({ description: 'Nombre de commandes contenant au moins un produit du vendeur', example: 12 }) commandes: number;
  @ApiProperty({ description: 'Chiffre d\'affaires total, en euros (quantité × prix des lignes du vendeur)', example: 1234.5 }) chiffreAffaires: number;
}
