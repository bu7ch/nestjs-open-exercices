import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

// 10.8 : les compteurs du throttler dans Redis : partagés entre les instances, et gardés au redémarrage.
// (`@nest-lab/throttler-storage-redis` ne s'installe pas avec NestJS 12 : le stockage tient en une méthode.)
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(cle: string, ttl: number, limite: number, _blocage: number, nom: string) {
    const k = `limite:${nom}:${cle}`;
    // INCR crée ou incrémente ; PEXPIRE … NX ne pose la durée qu'au premier appel de la fenêtre ; PTTL la lit.
    const resultats = await this.redis.multi().incr(k).pexpire(k, ttl, 'NX').pttl(k).exec();
    const total = Number(resultats?.[0]?.[1]);
    const resteMs = Number(resultats?.[2]?.[1]);
    const resteS = Math.ceil(resteMs / 1000);
    const bloque = total > limite;
    return { totalHits: total, timeToExpire: resteS, isBlocked: bloque, timeToBlockExpire: bloque ? resteS : 0 };
  }
}
