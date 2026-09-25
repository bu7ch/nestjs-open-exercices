import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CommandesService } from '../commandes.service.js';
import type { StatutCommande } from '../transitions.js';
import { STATUT_CLE } from './statut.decorator.js';

// 8.7 : la commande de la route doit avoir le statut qu'exige `@StatutRequis(...)`.
@Injectable()
export class StatutGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly commandes: CommandesService,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const requis = this.reflector.getAllAndOverride<StatutCommande | undefined>(STATUT_CLE, [contexte.getHandler(), contexte.getClass()]);
    if (!requis) return true;

    // 8.9 : le guard passe AVANT le ParseIntPipe de la méthode : `:id` est encore une chaîne brute.
    const id = Number(contexte.switchToHttp().getRequest<Request>().params.id);
    if (!Number.isInteger(id)) throw new BadRequestException('Identifiant de commande invalide');

    const commande = await this.commandes.trouverSansLignes(id);
    if (!commande) throw new NotFoundException(`Commande ${id} introuvable`);
    if (commande.statut !== requis) {
      throw new ForbiddenException(`Commande ${commande.statut} : il faut qu'elle soit ${requis}`);
    }
    return true;
  }
}
