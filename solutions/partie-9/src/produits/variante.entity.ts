import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Produit } from './produit.entity.js';

@Entity('variantes')
export class Variante {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nom: string;

  @Column({ default: 0 })
  stock: number;

  @ManyToOne('Produit', 'variantes', { onDelete: 'CASCADE' })
  produit: Produit;
}
