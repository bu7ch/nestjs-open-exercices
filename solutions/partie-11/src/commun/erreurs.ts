import { applyDecorators, BadRequestException, type ValidationError } from '@nestjs/common';
import { ApiExtraModels, ApiProperty, ApiPropertyOptional, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export interface ErreurDeChamp {
  champ: string;
  erreurs: string[];
}

// 9.13 : le message à plat de la partie 8 (rien ne casse), plus un détail par champ.
export function erreursDeValidation(erreurs: ValidationError[]) {
  const champs: ErreurDeChamp[] = erreurs.map((e) => ({ champ: e.property, erreurs: Object.values(e.constraints ?? {}) }));
  return new BadRequestException({ message: champs.flatMap((c) => c.erreurs), champs });
}

// 9.14 : la réponse d'erreur (le format unique du 8.14), documentée.
export class ErreurDeChampDto {
  @ApiProperty({ example: 'limite' }) champ: string;
  @ApiProperty({ type: [String], example: ['limite must not be greater than 100'] }) erreurs: string[];
}

export class ErreurDto {
  @ApiProperty({ example: 404 }) statusCode: number;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], example: 'Produit 9 introuvable' })
  message: string | string[];
  @ApiProperty({ example: '/api/produits/9' }) chemin: string;
  @ApiProperty({ type: String, format: 'date-time' }) horodatage: string;
  @ApiPropertyOptional({ description: 'Identifiant à communiquer pour retrouver l\'erreur dans les journaux' }) requeteId?: string;
  @ApiPropertyOptional({ type: [ErreurDeChampDto], description: 'Présent pour les erreurs de validation : une entrée par champ' }) champs?: ErreurDeChampDto[];
}

const DESCRIPTIONS: Record<number, string> = {
  400: 'Requête invalide (paramètre ou corps refusé)',
  401: 'Jeton manquant, invalide ou expiré',
  403: 'Action interdite',
  404: 'Ressource introuvable',
  409: 'Conflit avec l\'état actuel (doublon, ressource liée)',
};

export const ApiErreurs = (...statuts: number[]) =>
  applyDecorators(
    ApiExtraModels(ErreurDto),
    ...statuts.map((status) => ApiResponse({ status, description: DESCRIPTIONS[status], schema: { $ref: getSchemaPath(ErreurDto) } })),
  );
