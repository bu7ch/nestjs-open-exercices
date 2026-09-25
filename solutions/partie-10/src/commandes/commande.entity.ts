import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
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
}
