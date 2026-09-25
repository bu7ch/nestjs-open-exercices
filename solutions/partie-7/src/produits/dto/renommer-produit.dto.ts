import { IsNotEmpty, IsString } from 'class-validator';

// 7.14 : seulement le nouveau nom. Aucun identifiant de propriétaire : il vient du jeton.
export class RenommerProduitDto {
  @IsString()
  @IsNotEmpty()
  nom: string;
}
