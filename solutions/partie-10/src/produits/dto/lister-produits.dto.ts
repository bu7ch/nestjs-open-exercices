import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../commun/pagination.dto.js';
import { CATEGORIES } from './creer-produit.dto.js';

// 9.11 : une liste blanche. Le client envoie une clé, le code connaît la colonne SQL.
export const COLONNES_DE_TRI = { id: 'p.id', nom: 'p.nom', prix: 'p.prix' } as const;
export type ChampDeTri = keyof typeof COLONNES_DE_TRI;

// 9.10 : `extends PaginationDto` reprend `page` et `limite`, validation ET documentation.
export class ListerProduitsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Texte cherché dans le nom (sans tenir compte des majuscules)', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  recherche?: string;

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES)
  categorie?: string;

  @ApiPropertyOptional({ description: 'Prix minimal, en centimes', minimum: 0, example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prixMin?: number;

  @ApiPropertyOptional({ description: 'Prix maximal, en centimes', minimum: 0, example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prixMax?: number;

  // Le plus récent d'abord : c'est l'ordre dans lequel un ajout fait glisser les pages (9.9).
  @ApiPropertyOptional({ enum: Object.keys(COLONNES_DE_TRI), default: 'id' })
  @IsIn(Object.keys(COLONNES_DE_TRI))
  tri: ChampDeTri = 'id';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  ordre: 'asc' | 'desc' = 'desc';
}
