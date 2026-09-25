import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommandesGateway } from '../temps-reel/commandes.gateway.js';
import { VendeursModule } from '../vendeurs/vendeurs.module.js';
import { Commande } from './commande.entity.js';
import { CommandesDuVendeurController } from './commandes-du-vendeur.controller.js';
import { CommandesController } from './commandes.controller.js';
import { CommandesService } from './commandes.service.js';
import { FILE_EXPIRATIONS } from './expiration.js';
import { ExpirationProcessor } from './expiration.processor.js';
import { LigneCommande } from './ligne-commande.entity.js';

@Module({
  // 8.8 : le guard de propriété lit le vendeur avec VendeursService (11.4 : le gateway aussi).
  // 11.7 : la file des expirations (la connexion à Redis est déclarée une fois, dans AppModule).
  imports: [TypeOrmModule.forFeature([Commande, LigneCommande]), VendeursModule, BullModule.registerQueue({ name: FILE_EXPIRATIONS })],
  controllers: [CommandesController, CommandesDuVendeurController],
  providers: [CommandesService, CommandesGateway, ExpirationProcessor],
  // 11.13 : le webhook de paiement appelle marquerPayee.
  exports: [CommandesService],
})
export class CommandesModule {}
