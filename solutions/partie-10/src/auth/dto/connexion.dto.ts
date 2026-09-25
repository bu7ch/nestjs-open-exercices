import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConnexionDto {
  @ApiProperty({ description: 'Adresse e-mail du compte', example: 'alice@exemple.fr' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Mot de passe du compte', example: 'MotDePasse!42' })
  @IsString()
  @IsNotEmpty()
  motDePasse: string;
}
