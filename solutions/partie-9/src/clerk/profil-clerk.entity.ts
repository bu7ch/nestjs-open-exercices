import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Bonus 7.25 : notre ligne à nous, reliée à l'identifiant de l'utilisateur chez Clerk.
@Entity('profils_clerk')
export class ProfilClerk {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  clerkId: string;

  @Column({ type: 'varchar', default: 'acheteur' })
  role: string;
}
