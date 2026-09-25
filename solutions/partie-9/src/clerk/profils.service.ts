import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfilClerk } from './profil-clerk.entity.js';

@Injectable()
export class ProfilsService {
  constructor(@InjectRepository(ProfilClerk) private readonly profils: Repository<ProfilClerk>) {}

  // `upsert` : une seule instruction, appuyée sur l'unicité de clerkId. « Chercher puis créer »
  // laisserait passer deux premières requêtes simultanées (et une erreur 500).
  async trouverOuCreer(clerkId: string) {
    await this.profils.upsert({ clerkId }, ['clerkId']);
    return this.profils.findOneByOrFail({ clerkId });
  }
}
