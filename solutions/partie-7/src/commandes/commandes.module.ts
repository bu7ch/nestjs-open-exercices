import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Commande } from './commande.entity.js';
import { CommandesController } from './commandes.controller.js';
import { CommandesService } from './commandes.service.js';
import { LigneCommande } from './ligne-commande.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Commande, LigneCommande])],
  controllers: [CommandesController],
  providers: [CommandesService],
})
export class CommandesModule {}
