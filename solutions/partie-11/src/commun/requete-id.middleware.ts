import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export type RequeteAvecId = Request & { requeteId?: string };

// 8.4 : on ne reprend l'identifiant du client que s'il est sûr (lettres, chiffres, `-`, `_`, 64 au plus).
const FORMAT_VALIDE = /^[\w-]{1,64}$/;

@Injectable()
export class RequeteIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(requete: RequeteAvecId, reponse: Response, next: NextFunction) {
    const recu = requete.headers['x-request-id'];
    const id = typeof recu === 'string' && FORMAT_VALIDE.test(recu) ? recu : randomUUID();
    requete.requeteId = id;
    reponse.setHeader('X-Request-Id', id);

    // 8.5 : la réponse n'existe pas encore ; on journalise quand elle est partie.
    const debut = performance.now();
    reponse.on('finish', () => {
      const duree = Math.round(performance.now() - debut);
      // 10.11 : les mêmes informations en champs, pour les journaux JSON (sous `params`).
      this.logger.log(`${requete.method} ${requete.originalUrl} ${reponse.statusCode} ${duree} ms [${id}]`, {
        requeteId: id,
        methode: requete.method,
        url: requete.originalUrl,
        statut: reponse.statusCode,
        dureeMs: duree,
      });
    });
    next();
  }
}
