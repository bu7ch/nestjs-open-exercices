import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreerVarianteDto {
  @IsString()
  @IsNotEmpty()
  nom: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
