import { plainToInstance } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength, validateSync } from 'class-validator';

class VariablesEnvironnement {
  // 10.1 : une liste fermée ; une faute de frappe (`prod`) ne publie plus la documentation en production.
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @IsNumber()
  PORT: number = 3000;

  // 10.1 : les paramètres de la base, vérifiés au démarrage (et plus à la première requête).
  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @IsNumber()
  DB_PORT: number = 5432;

  @IsString()
  @IsNotEmpty()
  DB_USER: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string;

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

  // 10.8 : Redis, pour les compteurs de la limitation de débit.
  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number = 6379;

  // 11.7 : le délai de paiement d'une commande, avant son annulation automatique (30 minutes par défaut).
  @IsNumber()
  @Min(0)
  DELAI_PAIEMENT_MS: number = 30 * 60_000;

  // 11.13 : le secret partagé avec le prestataire de paiement (le webhook le lit avec getOrThrow).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  WEBHOOK_SECRET?: string;
}

export function validerEnvironnement(config: Record<string, unknown>) {
  const validees = plainToInstance(VariablesEnvironnement, config, { enableImplicitConversion: true });
  const erreurs = validateSync(validees, { skipMissingProperties: false });
  if (erreurs.length > 0) {
    // 10.1 : une seule ligne, qui nomme chaque variable fautive et la règle violée.
    const detail = erreurs.map((e) => `${e.property} (${Object.keys(e.constraints ?? {}).join(', ')})`).join(', ');
    throw new Error(`Variables d'environnement invalides : ${detail}`);
  }
  return validees;
}
