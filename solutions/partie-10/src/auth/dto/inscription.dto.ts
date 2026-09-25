import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class InscriptionDto {
  @ApiProperty({ description: 'Adresse e-mail (unique)', example: 'alice@exemple.fr' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Mot de passe, 8 caractères au moins', minLength: 8, example: 'MotDePasse!42' })
  @IsString()
  @MinLength(8)
  motDePasse: string;
}
