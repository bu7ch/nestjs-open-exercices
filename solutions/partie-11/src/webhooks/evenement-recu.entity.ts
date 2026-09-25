import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// 11.14 : chaque événement reçu est noté. L'identifiant est la clé primaire : PostgreSQL refuse lui-même
// un second enregistrement, même si deux livraisons arrivent à la même milliseconde.
@Entity('evenements_recus')
export class EvenementRecu {
  @PrimaryColumn()
  id: string;

  @Column()
  type: string;

  @CreateDateColumn()
  recuLe: Date;
}
