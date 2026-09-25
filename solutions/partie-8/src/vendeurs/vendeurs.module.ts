import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProduitsModule } from '../produits/produits.module.js';
import { Vendeur } from './vendeur.entity.js';
import { VendeursController } from './vendeurs.controller.js';
import { VendeursService } from './vendeurs.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Vendeur]), ProduitsModule],
  controllers: [VendeursController],
  providers: [VendeursService],
  exports: [VendeursService],
})
export class VendeursModule {}
