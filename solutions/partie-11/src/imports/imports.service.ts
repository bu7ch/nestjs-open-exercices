import { InjectQueue } from '@nestjs/bullmq';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import type { CompteCourantDonnees } from '../auth/types.js';
import { VendeursService } from '../vendeurs/vendeurs.service.js';

export const FILE_IMPORTS = 'imports';

export interface DemandeImport {
  vendeurId: number;
  csv: string;
}

export interface ResultatImport {
  crees: number;
  erreurs: { ligne: number; message: string }[];
}

/** 11.12 : un import par vendeur et par fichier : le même fichier renvoyé donne le même job. */
export const idImport = (vendeurId: number, csv: string) => `import-${vendeurId}-${createHash('sha256').update(csv).digest('hex').slice(0, 16)}`;

@Injectable()
export class ImportsService {
  constructor(
    @InjectQueue(FILE_IMPORTS) private readonly file: Queue<DemandeImport, ResultatImport>,
    private readonly vendeurs: VendeursService,
  ) {}

  // 11.10 : la route dépose la demande et répond aussitôt ; 11.11 : trois tentatives, espacées de 200 ms
  // puis 400 ms ; 11.12 : un job terminé est gardé un jour, et un même fichier est ignoré pendant ce jour.
  async demander(vendeurId: number, csv: string) {
    const job = await this.file.add(
      'import',
      { vendeurId, csv },
      {
        jobId: idImport(vendeurId, csv),
        attempts: 3,
        backoff: { type: 'exponential', delay: 200 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    );
    return { importId: job.id };
  }

  // 11.10 : l'état BullMQ du job (waiting, active, completed, failed…) et, une fois fini, son résultat.
  async etat(importId: string, compte: CompteCourantDonnees) {
    const job = await this.file.getJob(importId);
    if (!job) throw new NotFoundException(`Import ${importId} introuvable`);
    // Comme la route qui l'a déposé (8.8) : seuls le propriétaire du vendeur et un admin lisent le rapport.
    const vendeur = await this.vendeurs.trouverAvecCompte(job.data.vendeurId);
    if (compte.role !== 'admin' && vendeur?.compte?.id !== compte.id) throw new ForbiddenException('Cet import ne t\'appartient pas');
    const etat = await job.getState();
    return {
      etat,
      resultat: job.returnvalue ?? null,
      ...(etat === 'failed' && { raison: job.failedReason, tentatives: job.attemptsMade }),
    };
  }
}
