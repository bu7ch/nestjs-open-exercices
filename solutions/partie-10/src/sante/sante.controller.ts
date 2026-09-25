import { Controller, Get, Inject, UseFilters } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';
import { Public } from '../auth/public.decorator.js';
import { REDIS } from '../redis/redis.module.js';
import { SanteFilter } from './sante.filter.js';

// 8.6 : /sante, « vivant » ; 10.10 : /sante/pret, « prêt » (la base et Redis répondent).
// @SkipThrottle : un orchestrateur qui interroge la santé n'est pas un abus, et Redis arrêté ne doit pas
// faire répondre /sante en 500 (le throttler compte dans Redis).
@ApiTags('sante')
@Public()
@SkipThrottle()
@UseFilters(SanteFilter)
@Controller('sante')
export class SanteController {
  constructor(
    private readonly sante: HealthCheckService,
    private readonly base: TypeOrmHealthIndicator,
    private readonly indicateurs: HealthIndicatorService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  vivant() {
    return { statut: 'ok' };
  }

  @Get('pret')
  @HealthCheck()
  pret() {
    return this.sante.check([
      () => this.base.pingCheck('base').withTimeout(1000),
      () =>
        this.indicateurs
          .check('redis')
          .attempt(async () => {
            await this.redis.ping();
          })
          .withTimeout(1000),
    ]);
  }
}
