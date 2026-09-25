import { IsIn, IsInt, IsNotEmpty, IsString } from 'class-validator';
import { POSTES } from '../postes.js';

export class CreerJoueurDto {
  @IsString()
  @IsNotEmpty()
  prenom: string;

  @IsString()
  @IsNotEmpty()
  nom: string;

  @IsIn(POSTES)
  poste: string;

  @IsInt()
  equipeId: number;
}
