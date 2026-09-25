import { IsNotEmpty, IsString } from 'class-validator';

export class CreerVendeurDto {
  @IsString()
  @IsNotEmpty()
  nom: string;
}
