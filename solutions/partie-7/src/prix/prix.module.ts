import { Module } from '@nestjs/common';
import { PrixController } from './prix.controller.js';
import { PrixService } from './prix.service.js';

@Module({
  controllers: [PrixController],
  providers: [PrixService],
  exports: [PrixService],
})
export class PrixModule {}
