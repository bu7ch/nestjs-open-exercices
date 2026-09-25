import { Module } from '@nestjs/common';
import { VendeursModule } from '../vendeurs/vendeurs.module.js';
import { VendeursResolver } from './vendeurs.resolver.js';

@Module({
  imports: [VendeursModule],
  providers: [VendeursResolver],
})
export class GraphqlApiModule {}
