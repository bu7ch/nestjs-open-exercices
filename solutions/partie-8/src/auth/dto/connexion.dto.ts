import { IsNotEmpty, IsString } from 'class-validator';

export class ConnexionDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  motDePasse: string;
}
