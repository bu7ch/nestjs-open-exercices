import { IsIn, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export const CATEGORIES = ['papeterie', 'informatique', 'mobilier'] as const;

// 5.8 : `variantes` a quitté le DTO ; elles sont devenues une table (5.11).
export class CreerProduitDto {
  @IsString()
  @IsNotEmpty()
  nom: string;

  @IsNumber()
  @Min(0)
  prix: number;

  @IsIn(CATEGORIES)
  categorie: string;
}
