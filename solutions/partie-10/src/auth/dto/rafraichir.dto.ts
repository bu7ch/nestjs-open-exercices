import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RafraichirDto {
  @ApiProperty({ description: 'Le refresh token reçu à la connexion' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
