import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../comptes/compte.entity.js';
import { ROLES_CLE } from './roles.decorator.js';
import type { RequeteAuthentifiee } from './types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexte: ExecutionContext): boolean {
    const rolesAutorises = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_CLE, [contexte.getHandler(), contexte.getClass()]);
    if (!rolesAutorises) return true;

    // L'identité vient d'AuthGuard, qui DOIT donc passer avant (7.13).
    const compte = contexte.switchToHttp().getRequest<RequeteAuthentifiee>().compte;
    if (!compte || !rolesAutorises.includes(compte.role)) {
      throw new ForbiddenException('Rôle insuffisant');
    }
    return true;
  }
}
