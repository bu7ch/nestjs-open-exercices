import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { CATEGORIES } from '../dto/creer-produit.dto.js';

@Injectable()
export class CategorieValidePipe implements PipeTransform {
  transform(valeur: string) {
    if (!CATEGORIES.includes(valeur as (typeof CATEGORIES)[number])) {
      throw new BadRequestException(`Catégorie inconnue : ${valeur}`);
    }
    return valeur;
  }
}
