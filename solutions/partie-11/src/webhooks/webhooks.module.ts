import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommandesModule } from '../commandes/commandes.module.js';
import { EvenementRecu } from './evenement-recu.entity.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EvenementRecu]), CommandesModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
