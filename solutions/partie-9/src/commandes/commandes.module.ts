import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendeursModule } from '../vendeurs/vendeurs.module.js';
import { Commande } from './commande.entity.js';
import { CommandesDuVendeurController } from './commandes-du-vendeur.controller.js';
import { CommandesController } from './commandes.controller.js';
import { CommandesService } from './commandes.service.js';
import { LigneCommande } from './ligne-commande.entity.js';

@Module({
  // 8.8 : le guard de propriété lit le vendeur avec VendeursService.
  imports: [TypeOrmModule.forFeature([Commande, LigneCommande]), VendeursModule],
  controllers: [CommandesController, CommandesDuVendeurController],
  providers: [CommandesService],
})
export class CommandesModule {}
