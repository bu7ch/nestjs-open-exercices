import { Injectable } from '@nestjs/common';

export interface Equipe {
  id: number;
  nom: string;
  ville: string;
  conference: 'Est' | 'Ouest';
}

@Injectable()
export class EquipesService {
  private readonly equipes: Equipe[] = [
    { id: 1, nom: 'Celtics', ville: 'Boston', conference: 'Est' },
    { id: 2, nom: 'Lakers', ville: 'Los Angeles', conference: 'Ouest' },
    { id: 3, nom: 'Bucks', ville: 'Milwaukee', conference: 'Est' },
    { id: 4, nom: 'Nuggets', ville: 'Denver', conference: 'Ouest' },
  ];

  trouverTous(): Equipe[] {
    return this.equipes;
  }

  trouverUne(id: number): Equipe | undefined {
    return this.equipes.find((equipe) => equipe.id === id);
  }
}
