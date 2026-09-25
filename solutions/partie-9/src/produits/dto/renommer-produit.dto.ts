import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// 7.14 : seulement le nouveau nom. Aucun identifiant de propriétaire : il vient du jeton.
export class RenommerProduitDto {
  @ApiProperty({ description: 'Nouveau nom du produit', example: 'Lampe d\'architecte' })
  @IsString()
  @IsNotEmpty()
  nom: string;
}
