import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Equipe, EquipesService } from '../equipes/equipes.service.js';
import { CreerJoueurDto } from './dto/creer-joueur.dto.js';

export interface Joueur {
  id: number;
  prenom: string;
  nom: string;
  poste: string;
  equipeId: number;
}

@Injectable()
export class JoueursService {
  private readonly joueurs: Joueur[] = [
    { id: 1, prenom: 'Jayson', nom: 'Tatum', poste: 'ailier', equipeId: 1 },
    { id: 2, prenom: 'Jrue', nom: 'Holiday', poste: 'meneur', equipeId: 1 },
    { id: 3, prenom: 'LeBron', nom: 'James', poste: 'ailier', equipeId: 2 },
    { id: 4, prenom: 'Anthony', nom: 'Davis', poste: 'ailier-fort', equipeId: 2 },
    { id: 5, prenom: 'Giannis', nom: 'Antetokounmpo', poste: 'ailier-fort', equipeId: 3 },
    { id: 6, prenom: 'Damian', nom: 'Lillard', poste: 'meneur', equipeId: 3 },
    { id: 7, prenom: 'Nikola', nom: 'Jokic', poste: 'pivot', equipeId: 4 },
    { id: 8, prenom: 'Jamal', nom: 'Murray', poste: 'arriere', equipeId: 4 },
  ];

  constructor(
    private readonly equipesService: EquipesService,
    private readonly config: ConfigService,
  ) {}

  trouverTous(limite: number): Joueur[] {
    return this.joueurs.slice(0, limite);
  }

  trouverUn(id: number): Joueur & { equipe: Equipe | undefined } {
    const joueur = this.joueurs.find((j) => j.id === id);
    if (!joueur) throw new NotFoundException(`Joueur ${id} introuvable`);
    return { ...joueur, equipe: this.equipesService.trouverUne(joueur.equipeId) };
  }

  trouverParPoste(poste: string): Joueur[] {
    return this.joueurs.filter((j) => j.poste === poste);
  }

  creer(dto: CreerJoueurDto): Joueur {
    const maximum = this.config.get<number>('NOMBRE_MAX_JOUEURS');
    if (maximum !== undefined && this.joueurs.length >= Number(maximum)) {
      throw new BadRequestException(`Nombre maximum de joueurs atteint (${maximum})`);
    }
    if (!this.equipesService.trouverUne(dto.equipeId)) {
      throw new BadRequestException(`Équipe ${dto.equipeId} introuvable`);
    }
    const joueur = { id: Math.max(0, ...this.joueurs.map((j) => j.id)) + 1, ...dto };
    this.joueurs.push(joueur);
    return joueur;
  }
}
