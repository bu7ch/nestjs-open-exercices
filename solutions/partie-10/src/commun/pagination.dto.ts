import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// 9.7 : `?page=2` arrive comme le TEXTE "2" : `@Type(() => Number)` le convertit avant `@IsInt()` (9.8).
export class PaginationDto {
  @ApiPropertyOptional({ description: 'Numéro de la page, à partir de 1', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Nombre d\'éléments par page', minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite: number = 20;
}
