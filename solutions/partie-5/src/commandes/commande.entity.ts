import { CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { LigneCommande } from './ligne-commande.entity.js';

@Entity('commandes')
export class Commande {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  dateCommande: Date;

  // `cascade: true` : `save` écrit la commande ET ses lignes, d'un coup.
  @OneToMany('LigneCommande', 'commande', { cascade: true })
  lignes: LigneCommande[];
}
