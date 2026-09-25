import type { NextFunction, Request, Response } from 'express';

// 8.6 : un middleware fonctionnel, sans injection : quelques lignes suffisent.
export function serveurMiddleware(_requete: Request, reponse: Response, suivant: NextFunction) {
  reponse.setHeader('X-Serveur', 'marketplace');
  suivant();
}
