import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type Role = 'acheteur' | 'vendeur' | 'admin';

// 7.2 : les comptes de la marketplace. On ne stocke jamais un mot de passe : seulement son empreinte.
@Entity('comptes')
export class Compte {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  // `select: false` : ni `find()` ni `findOneBy()` ne chargent l'empreinte, qui ne peut donc pas
  // finir dans une réponse JSON par mégarde.
  @Column({ select: false })
  motDePasseHache: string;

  // TypeORM ne sait pas déduire un type de colonne d'une union TypeScript : on lui dit que c'est du texte.
  @Column({ type: 'varchar', default: 'acheteur' })
  role: Role;

  // 7.15 : l'empreinte du refresh token en cours ; null = aucune session ouverte.
  @Column({ type: 'varchar', nullable: true, select: false })
  refreshTokenHache: string | null;
}
