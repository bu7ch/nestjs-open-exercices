import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ImporterCatalogueDto {
  @ApiProperty({ description: 'Le catalogue au format CSV (séparateur `;`), en-tête compris', example: 'nom;prix;categorie\nTable;120;mobilier' })
  @IsString()
  @IsNotEmpty()
  csv: string;
}
