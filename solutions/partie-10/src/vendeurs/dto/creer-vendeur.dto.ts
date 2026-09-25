import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreerVendeurDto {
  @ApiProperty({ description: 'Nom de la boutique', example: 'Atelier du Bois' })
  @IsString()
  @IsNotEmpty()
  nom: string;
}
