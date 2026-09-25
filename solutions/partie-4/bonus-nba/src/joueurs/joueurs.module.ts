import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module.js';
import { JoueursController } from './joueurs.controller.js';
import { JoueursService } from './joueurs.service.js';

@Module({
  imports: [EquipesModule],
  controllers: [JoueursController],
  providers: [JoueursService],
})
export class JoueursModule {}
