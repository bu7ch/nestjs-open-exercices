import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LigneCommande } from '../commandes/ligne-commande.entity.js';
import { ClassementVendeursController } from './classement-vendeurs.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([LigneCommande])],
  controllers: [ClassementVendeursController],
})
export class ClassementModule {}
