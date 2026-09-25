import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export const CATEGORIES = ['papeterie', 'informatique', 'mobilier'] as const;

// 5.8 : `variantes` a quitté le DTO ; elles sont devenues une table (5.11).
export class CreerProduitDto {
  @ApiProperty({ description: 'Nom du produit', example: 'Lampe de bureau' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiProperty({ description: 'Prix unitaire en euros', minimum: 0, example: 30 })
  @IsNumber()
  @Min(0)
  prix: number;

  @ApiProperty({ enum: CATEGORIES, example: 'mobilier' })
  @IsIn(CATEGORIES)
  categorie: string;

  // 8.11 : facultatif ; masqué par MasquerPrixAchatInterceptor pour qui n'est pas le propriétaire.
  @ApiPropertyOptional({ description: 'Prix d\'achat en euros (visible du propriétaire et d\'un admin)', minimum: 0, example: 18 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  prixAchat?: number;
}
