import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Produit } from './produit.entity.js';
import { ProduitsController } from './produits.controller.js';
import { ProduitsService } from './produits.service.js';
import { Variante } from './variante.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Produit, Variante])],
  controllers: [ProduitsController],
  providers: [ProduitsService],
  exports: [ProduitsService],
})
export class ProduitsModule {}
