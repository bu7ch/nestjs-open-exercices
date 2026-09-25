import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, getSchemaPath } from '@nestjs/swagger';

export class MetaPage {
  @ApiProperty({ example: 2 }) page: number;
  @ApiProperty({ example: 20 }) limite: number;
  @ApiProperty({ example: 57 }) total: number;
  @ApiProperty({ example: 3 }) totalPages: number;
}

export interface Page<T> {
  donnees: T[];
  meta: MetaPage;
}

export function creerPage<T>(donnees: T[], total: number, page: number, limite: number): Page<T> {
  return { donnees, meta: { page, limite, total, totalPages: Math.ceil(total / limite) } };
}

// 9.7 : `Page<ProduitReponseDto>` n'existe plus à l'exécution (types effacés) : le schéma s'écrit à la main.
// 9.8 : sans ApiExtraModels, les références `$ref` pointent vers des schémas jamais ajoutés au document.
export const ApiPage = <M extends Type<unknown>>(modele: M) =>
  applyDecorators(
    ApiExtraModels(MetaPage, modele),
    ApiOkResponse({
      schema: {
        // L'interceptor global du 8.13 entoure chaque réponse réussie de `{ data }`.
        required: ['data'],
        properties: {
          data: {
            type: 'object',
            required: ['donnees', 'meta'],
            properties: {
              donnees: { type: 'array', items: { $ref: getSchemaPath(modele) } },
              meta: { $ref: getSchemaPath(MetaPage) },
            },
          },
        },
      },
    }),
  );
