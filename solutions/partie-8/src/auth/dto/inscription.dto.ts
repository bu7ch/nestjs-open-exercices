import { IsEmail, IsString, MinLength } from 'class-validator';

export class InscriptionDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  motDePasse: string;
}
