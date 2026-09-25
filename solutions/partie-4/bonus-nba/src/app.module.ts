import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validerEnvironnement } from './config/variables-environnement.js';
import { EquipesModule } from './equipes/equipes.module.js';
import { JoueursModule } from './joueurs/joueurs.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validerEnvironnement }), EquipesModule, JoueursModule],
})
export class AppModule {}
