import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Produit } from '../produits/produit.entity.js';

@Entity('vendeurs')
export class Vendeur {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nom: string;

  @OneToMany('Produit', 'vendeur')
  produits: Produit[];
}
