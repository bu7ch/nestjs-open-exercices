import { IsInt, IsNumber, Min } from 'class-validator';

export class CalculerTotalDto {
  @IsNumber()
  @Min(0)
  prixUnitaire: number;

  @IsInt()
  @Min(1)
  quantite: number;
}
