import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { EntityManager, Repository } from 'typeorm';
import type { CommandeCreee } from '../temps-reel/evenements.js';
import { Commande } from './commande.entity.js';
import { CreerCommandeDto } from './dto/creer-commande.dto.js';
import { FILE_EXPIRATIONS, idExpiration, type Expiration } from './expiration.js';
import { transitionner } from './transitions.js';

@Injectable()
export class CommandesService {
  constructor(
    @InjectRepository(Commande) private readonly commandes: Repository<Commande>,
    @InjectQueue(FILE_EXPIRATIONS) private readonly expirations: Queue<Expiration>,
    private readonly config: ConfigService,
  ) {}

  // 11.5 : l'acheteur vient du jeton ; 11.7 : la commande expire si elle n'est pas payée à temps.
  async creer(dto: CreerCommandeDto, acheteurId?: number) {
    const commande = this.commandes.create({
      lignes: dto.lignes.map((ligne) => ({ quantite: ligne.quantite, variante: { id: ligne.varianteId } })),
      acheteur: acheteurId ? { id: acheteurId } : null,
    });
    const creee = await this.commandes.save(commande);
    await this.programmerExpiration(creee.id);
    return creee;
  }

  // 11.7 : un job différé dans Redis (il survit au redémarrage), retrouvable par son identifiant.
  programmerExpiration(commandeId: number) {
    return this.expirations.add(
      'expiration',
      { commandeId },
      { jobId: idExpiration(commandeId), delay: Number(this.config.get('DELAI_PAIEMENT_MS')), removeOnComplete: true, removeOnFail: true },
    );
  }

  // 11.8 : `getJob` d'abord : `file.remove(id)` répond pareil pour un job qui n'a jamais existé.
  async annulerExpiration(commandeId: number) {
    const job = await this.expirations.getJob(idExpiration(commandeId));
    if (!job) return false;
    await job.remove();
    return true;
  }

  // 11.8 : payée, la commande n'expire plus. `base` : pour écrire dans la transaction d'un webhook (11.14).
  async marquerPayee(id: number, base: EntityManager = this.commandes.manager) {
    const commande = await base.findOneBy(Commande, { id });
    if (!commande) throw new NotFoundException(`Commande ${id} introuvable`);
    commande.statut = transitionner(commande.statut, 'payee');
    await base.save(commande);
    await this.annulerExpiration(id);
    return commande;
  }

  /** 11.7 : annule une commande encore en attente ; null si elle n'existe plus ou n'est plus en attente. */
  async expirer(id: number) {
    const commande = await this.commandes.findOne({ where: { id }, relations: { acheteur: true } });
    if (!commande || commande.statut !== 'en_attente') return null;
    commande.statut = transitionner(commande.statut, 'annulee');
    return this.commandes.save(commande);
  }

  async trouverUne(id: number) {
    const commande = await this.commandes.findOne({
      where: { id },
      relations: { lignes: { variante: { produit: true } } },
    });
    if (!commande) throw new NotFoundException(`Commande ${id} introuvable`);
    return commande;
  }

  // 8.7 : ce dont le guard de statut a besoin, sans charger les lignes.
  trouverSansLignes(id: number) {
    return this.commandes.findOneBy({ id });
  }

  // 11.5 : l'acheteur aussi, pour le prévenir.
  async expedier(id: number) {
    const commande = await this.commandes.findOne({ where: { id }, relations: { acheteur: true } });
    if (!commande) throw new NotFoundException(`Commande ${id} introuvable`);
    commande.statut = transitionner(commande.statut, 'expediee');
    const { acheteur, ...expediee } = await this.commandes.save(commande);
    return { commande: expediee, acheteurId: acheteur?.id };
  }

  // 8.8 : les commandes qui contiennent un produit de ce vendeur (et seulement ses lignes à lui).
  parVendeur(vendeurId: number) {
    return this.commandes.find({
      where: { lignes: { variante: { produit: { vendeur: { id: vendeurId } } } } },
      relations: { lignes: { variante: { produit: true } } },
      order: { id: 'ASC' },
    });
  }

  /** 11.1, 11.5 : la commande découpée par vendeur ; chacun ne reçoit que SES lignes. */
  async decouperParVendeur(commandeId: number): Promise<Map<number, CommandeCreee>> {
    const commande = await this.commandes.findOne({
      where: { id: commandeId },
      relations: { lignes: { variante: { produit: { vendeur: true } } } },
      order: { lignes: { id: 'ASC' } },
    });
    const parVendeur = new Map<number, CommandeCreee>();
    for (const ligne of commande?.lignes ?? []) {
      const vendeurId = ligne.variante.produit.vendeur.id;
      if (!parVendeur.has(vendeurId)) parVendeur.set(vendeurId, { commandeId, lignes: [] });
      parVendeur.get(vendeurId)!.lignes.push({ produit: ligne.variante.produit.nom, quantite: ligne.quantite });
    }
    return parVendeur;
  }

  /** 11.6 : le rattrapage : les commandes en attente du vendeur, avec seulement ses lignes. */
  async enAttentePourLeVendeur(vendeurId: number): Promise<CommandeCreee[]> {
    const commandes = await this.commandes.find({
      where: { statut: 'en_attente', lignes: { variante: { produit: { vendeur: { id: vendeurId } } } } },
      relations: { lignes: { variante: { produit: true } } },
      order: { id: 'ASC', lignes: { id: 'ASC' } },
    });
    // Le `where` sur les lignes filtre aussi les lignes chargées : il ne reste que celles du vendeur.
    return commandes.map((c) => ({ commandeId: c.id, lignes: c.lignes.map((l) => ({ produit: l.variante.produit.nom, quantite: l.quantite })) }));
  }
}
