import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// 9.9 : une classe à part : `PaginationDto` refuserait `apres` (`property apres should not exist`).
export class CurseurDto {
  @ApiPropertyOptional({ description: 'Identifiant du dernier élément déjà reçu (0 pour commencer)', minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  apres: number = 0;

  @ApiPropertyOptional({ description: 'Nombre d\'éléments à renvoyer', minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite: number = 20;
}
