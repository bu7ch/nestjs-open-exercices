import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { SanteController } from './sante.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [SanteController],
})
export class SanteModule {}
