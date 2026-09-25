import type { Request } from 'express';
import type { Role } from '../comptes/compte.entity.js';

export interface PayloadJwt {
  sub: number;
  email: string;
  role: Role;
}

export interface CompteCourantDonnees {
  id: number;
  email: string;
  role: Role;
}

export type RequeteAuthentifiee = Request & { compte?: CompteCourantDonnees };
