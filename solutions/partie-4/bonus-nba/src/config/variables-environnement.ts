import { IsNumber, Min } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

class VariablesEnvironnement {
  @IsNumber()
  PORT: number = 3000;

  @IsNumber()
  @Min(1)
  NOMBRE_MAX_JOUEURS: number;
}

export function validerEnvironnement(config: Record<string, unknown>) {
  const validees = plainToInstance(VariablesEnvironnement, config, { enableImplicitConversion: true });
  const erreurs = validateSync(validees, { skipMissingProperties: false });
  if (erreurs.length > 0) throw new Error(erreurs.toString());
  return validees;
}
