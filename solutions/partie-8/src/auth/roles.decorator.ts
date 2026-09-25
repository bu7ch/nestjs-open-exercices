import { SetMetadata } from '@nestjs/common';
import type { Role } from '../comptes/compte.entity.js';

export const ROLES_CLE = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_CLE, roles);
