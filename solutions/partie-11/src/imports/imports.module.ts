import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { VendeursModule } from '../vendeurs/vendeurs.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsProcessor } from './imports.processor.js';
import { FILE_IMPORTS, ImportsService } from './imports.service.js';

@Module({
  // VendeursModule : pour ProprietaireVendeurGuard (8.8), et le propriétaire d'un import.
  imports: [BullModule.registerQueue({ name: FILE_IMPORTS }), VendeursModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsProcessor],
})
export class ImportsModule {}
