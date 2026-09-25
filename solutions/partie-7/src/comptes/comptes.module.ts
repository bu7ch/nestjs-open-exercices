import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Compte } from './compte.entity.js';
import { ComptesController } from './comptes.controller.js';
import { ComptesService } from './comptes.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Compte])],
  controllers: [ComptesController],
  providers: [ComptesService],
  exports: [ComptesService],
})
export class ComptesModule {}
