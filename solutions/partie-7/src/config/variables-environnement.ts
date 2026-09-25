import { IsNumber, IsString, Min, MinLength } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

class VariablesEnvironnement {
  @IsNumber()
  PORT: number = 3000;

  @IsNumber()
  @Min(1)
  NOMBRE_MAX_PRODUITS: number;

  // 7.5 : un secret court se devine, et permet de fabriquer de faux jetons.
  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  // 7.15 : un second secret, pour que jeton d'accès et refresh token ne se confondent pas.
  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;
}

export function validerEnvironnement(config: Record<string, unknown>) {
  const validees = plainToInstance(VariablesEnvironnement, config, { enableImplicitConversion: true });
  const erreurs = validateSync(validees, { skipMissingProperties: false });
  if (erreurs.length > 0) throw new Error(erreurs.toString());
  return validees;
}
