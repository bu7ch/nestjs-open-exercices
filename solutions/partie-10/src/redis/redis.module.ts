import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// 10.8 : un client Redis injectable partout (`@Inject(REDIS)`), fermé proprement à l'arrêt.
export const REDIS = 'REDIS';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Une commande échoue après un seul nouvel essai quand Redis est injoignable, au lieu d'attendre.
        const redis = new Redis({ host: config.get('REDIS_HOST'), port: config.get('REDIS_PORT'), maxRetriesPerRequest: 1 });
        const logger = new Logger('Redis');
        // Sans cet écouteur, ioredis écrit `[ioredis] Unhandled error event` hors du journal de NestJS.
        redis.on('error', (erreur: NodeJS.ErrnoException) => logger.warn(`Redis injoignable (${erreur.code ?? erreur.message})`));
        return redis;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
