import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Min } from 'class-validator';

export class CalculerTotalDto {
  @ApiProperty({ description: 'Prix unitaire en euros', minimum: 0, example: 0.7 })
  @IsNumber()
  @Min(0)
  prixUnitaire: number;

  @ApiProperty({ description: 'Nombre d\'unités', minimum: 1, example: 12 })
  @IsInt()
  @Min(1)
  quantite: number;
}
