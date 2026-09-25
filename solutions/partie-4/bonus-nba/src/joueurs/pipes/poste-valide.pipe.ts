import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { POSTES } from '../postes.js';

@Injectable()
export class PosteValidePipe implements PipeTransform {
  transform(valeur: string) {
    if (!POSTES.includes(valeur as (typeof POSTES)[number])) {
      throw new BadRequestException(`Poste inconnu : ${valeur}`);
    }
    return valeur;
  }
}
