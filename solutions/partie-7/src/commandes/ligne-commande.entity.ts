import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Variante } from '../produits/variante.entity.js';
import type { Commande } from './commande.entity.js';

@Entity('lignes_commande')
export class LigneCommande {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  quantite: number;

  @ManyToOne('Commande', 'lignes', { onDelete: 'CASCADE' })
  commande: Commande;

  @ManyToOne(() => Variante)
  variante: Variante;
}
