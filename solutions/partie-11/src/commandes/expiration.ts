// 11.7 : la file des expirations, et l'identifiant choisi de chaque job (pas de `:`, pas un entier seul).
export const FILE_EXPIRATIONS = 'expirations';

export interface Expiration {
  commandeId: number;
}

export const idExpiration = (commandeId: number) => `expiration-${commandeId}`;
