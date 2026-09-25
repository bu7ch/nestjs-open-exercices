import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validerEnvironnement } from './config/variables-environnement.js';
import { ProduitsModule } from './produits/produits.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validerEnvironnement }), ProduitsModule, CategoriesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
