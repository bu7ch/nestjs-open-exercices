import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreerVarianteDto {
  @ApiProperty({ description: 'Nom de la variante', example: 'Rouge' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiPropertyOptional({ description: 'Stock disponible', minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
