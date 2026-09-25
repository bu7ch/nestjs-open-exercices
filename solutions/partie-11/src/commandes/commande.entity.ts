import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Compte } from '../comptes/compte.entity.js';
import type { LigneCommande } from './ligne-commande.entity.js';
import type { StatutCommande } from './transitions.js';

@Entity('commandes')
export class Commande {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  dateCommande: Date;

  // 8.7 : le statut de la commande (les passages autorisés sont ceux de transitionner, 6.5).
  @Column({ type: 'varchar', default: 'en_attente' })
  statut: StatutCommande;

  // `cascade: true` : `save` écrit la commande ET ses lignes, d'un coup.
  @OneToMany('LigneCommande', 'commande', { cascade: true })
  lignes: LigneCommande[];

  // 11.5 : le compte qui a passé la commande (rempli depuis le jeton) ; null pour les commandes d'avant.
  @ManyToOne('Compte', { nullable: true, onDelete: 'SET NULL' })
  acheteur: Compte | null;
}
