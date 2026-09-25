import { SetMetadata } from '@nestjs/common';
import type { StatutCommande } from '../transitions.js';

export const STATUT_CLE = 'statutRequis';
export const StatutRequis = (statut: StatutCommande) => SetMetadata(STATUT_CLE, statut);
