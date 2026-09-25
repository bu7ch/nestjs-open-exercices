import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Compte } from '../comptes/compte.entity.js';
import type { Produit } from '../produits/produit.entity.js';

@Entity('vendeurs')
export class Vendeur {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nom: string;

  @OneToMany('Produit', 'vendeur')
  produits: Produit[];

  // 7.14 : le compte à qui appartient ce vendeur (null pour les vendeurs créés avant la partie 7).
  @ManyToOne('Compte', { nullable: true, onDelete: 'SET NULL' })
  compte: Compte | null;
}
