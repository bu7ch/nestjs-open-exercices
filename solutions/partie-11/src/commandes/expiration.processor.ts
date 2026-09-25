import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { CommandesGateway } from '../temps-reel/commandes.gateway.js';
import { CommandesService } from './commandes.service.js';
import { FILE_EXPIRATIONS, type Expiration } from './expiration.js';

// 11.7 : le worker. Au démarrage de l'application, NestJS crée un worker BullMQ sur la file `expirations`.
@Processor(FILE_EXPIRATIONS)
export class ExpirationProcessor extends WorkerHost {
  constructor(
    private readonly commandes: CommandesService,
    private readonly gateway: CommandesGateway,
  ) {
    super();
  }

  async process(job: Job<Expiration>) {
    const annulee = await this.commandes.expirer(job.data.commandeId);
    // Payée (ou déjà annulée) entre-temps : le job est périmé, il ne change rien.
    if (!annulee) return 'ignoré';
    if (annulee.acheteur) this.gateway.notifierStatut(annulee.acheteur.id, annulee.id, 'annulee');
    return 'annulee';
  }
}
