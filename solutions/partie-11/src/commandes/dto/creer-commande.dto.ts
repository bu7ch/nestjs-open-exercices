import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

// La validation de chaque ligne (@ValidateNested) dépasse la partie 5 : on s'en passe ici.
export class CreerCommandeDto {
  @ApiProperty({ description: 'Les lignes de la commande', example: [{ varianteId: 1, quantite: 2 }] })
  @IsArray()
  lignes: { varianteId: number; quantite: number }[];
}
