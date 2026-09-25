import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Commande } from '../commandes/commande.entity.js';
import { CommandesService } from '../commandes/commandes.service.js';
import { EvenementRecu } from './evenement-recu.entity.js';

export interface EvenementDePaiement {
  id: string;
  type: string;
  data: { object: { commandeId?: number } };
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly dataSource: DataSource,
    private readonly commandes: CommandesService,
  ) {}

  // 11.14 : une transaction. L'événement est noté EN PREMIER : une seconde livraison, même simultanée,
  // attend puis bute sur la clé primaire (23505). 11.15 : si le paiement échoue, tout est annulé, y
  // compris la note : la livraison suivante sera traitée.
  async traiter(evenement: EvenementDePaiement): Promise<{ doublon: boolean }> {
    try {
      return await this.dataSource.transaction(async (base) => {
        await base.insert(EvenementRecu, { id: evenement.id, type: evenement.type });
        if (evenement.type !== 'paiement.reussi') {
          this.logger.log(`Événement ignoré : ${evenement.type}`);
          return { doublon: false };
        }
        const commandeId = Number(evenement.data?.object?.commandeId);
        // 11.15 : une commande inconnue ne le deviendra pas : 200, l'événement est noté et ignoré. Un 4xx
        // ferait réessayer le prestataire pendant des jours, pour rien.
        if (!Number.isInteger(commandeId) || !(await base.existsBy(Commande, { id: commandeId }))) {
          this.logger.warn(`Paiement ${evenement.id} ignoré : commande ${String(evenement.data?.object?.commandeId)} introuvable`);
          return { doublon: false };
        }
        await this.commandes.marquerPayee(commandeId, base);
        return { doublon: false };
      });
    } catch (erreur) {
      // Un doublon n'est pas une erreur : 200, sinon le prestataire réessaierait encore et encore.
      if (erreur instanceof QueryFailedError && (erreur.driverError as { code?: string }).code === '23505') return { doublon: true };
      throw erreur;
    }
  }
}
