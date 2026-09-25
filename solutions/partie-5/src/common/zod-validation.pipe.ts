// Bonus 4.16 : pour l'essayer, remplace le @Body() de POST /api/produits par
// @Body(new ZodValidationPipe(creerProduitSchema)). La solution ne le branche pas :
// le cours continue avec class-validator (variantes, whitelist, etc.).
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(valeur: unknown) {
    const resultat = this.schema.safeParse(valeur);
    if (!resultat.success) {
      throw new BadRequestException(resultat.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    }
    return resultat.data;
  }
}
