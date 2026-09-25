import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export const CATEGORIES = ['papeterie', 'informatique', 'mobilier'] as const;

export class CreerProduitDto {
  @IsString()
  @IsNotEmpty()
  nom: string;

  @IsNumber()
  @Min(0)
  prix: number;

  @IsIn(CATEGORIES)
  categorie: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variantes?: string[];
}
