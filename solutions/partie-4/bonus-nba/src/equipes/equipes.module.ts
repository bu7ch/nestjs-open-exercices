import { Module } from '@nestjs/common';
import { EquipesController } from './equipes.controller.js';
import { EquipesService } from './equipes.service.js';

@Module({
  controllers: [EquipesController],
  providers: [EquipesService],
  exports: [EquipesService],
})
export class EquipesModule {}
