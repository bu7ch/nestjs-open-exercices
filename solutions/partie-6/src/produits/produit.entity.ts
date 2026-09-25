import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Vendeur } from '../vendeurs/vendeur.entity.js';
import type { Variante } from './variante.entity.js';

@Entity('produits')
export class Produit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nom: string;

  // PostgreSQL renvoie un `numeric` sous forme de chaîne ("30.00") : pour ne jamais perdre en précision.
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  prix: number;

  @Column()
  categorie: string;

  // 5.15 : ajoutée par une migration, sans perdre les produits existants.
  @Column({ default: true })
  actif: boolean;

  @ManyToOne('Vendeur', 'produits', { onDelete: 'CASCADE' })
  vendeur: Vendeur;

  @OneToMany('Variante', 'produit')
  variantes: Variante[];
}
