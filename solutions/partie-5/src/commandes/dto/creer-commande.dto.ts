import { IsArray } from 'class-validator';

// La validation de chaque ligne (@ValidateNested) dépasse la partie 5 : on s'en passe ici.
export class CreerCommandeDto {
  @IsArray()
  lignes: { varianteId: number; quantite: number }[];
}
