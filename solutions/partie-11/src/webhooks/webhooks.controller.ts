import { BadRequestException, Controller, Headers, HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import Stripe from 'stripe';
import { Public } from '../auth/public.decorator.js';
import { WebhooksService, type EvenementDePaiement } from './webhooks.service.js';

// Bonus 11.13 : appelée par le prestataire de paiement, pas par un client de l'API (d'où son absence de
// la documentation publique).
@ApiExcludeController()
@Controller('api/webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
  ) {}

  // Pas de jeton JWT : c'est la signature qui protège la route. 200 = « bien reçu ».
  @Public()
  @Post('paiements')
  @HttpCode(200)
  recevoir(@Req() requete: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string | undefined) {
    let evenement: EvenementDePaiement;
    try {
      // Le corps BRUT (rawBody: true à la création de l'application) : l'objet relu par NestJS, ou
      // JSON.stringify de cet objet, ne donnent pas les mêmes octets.
      evenement = Stripe.webhooks.constructEvent(requete.rawBody as Buffer, signature ?? '', this.config.getOrThrow('WEBHOOK_SECRET')) as unknown as EvenementDePaiement;
    } catch (erreur) {
      throw new BadRequestException(`Signature refusée : ${(erreur as Error).message}`);
    }
    return this.webhooks.traiter(evenement);
  }
}
