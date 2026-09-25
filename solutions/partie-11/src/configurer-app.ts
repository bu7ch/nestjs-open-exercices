import { INestApplication, ValidationPipe, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { erreursDeValidation } from './commun/erreurs.js';
import { RedisIoAdapter } from './temps-reel/redis-io.adapter.js';

// 6.11 : toute la configuration de l'application, appelée par main.ts ET par les tests.
export function configurerApp(app: INestApplication) {
  // 10.15 : derrière UN reverse proxy, l'adresse du client est celle qu'il écrit dans X-Forwarded-For
  // (sans cela, le throttler compte tous les clients ensemble). Seulement si seul le proxy joint l'API.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // 7.20 : des en-têtes de sécurité (et plus de X-Powered-By), et seulement l'origine du front.
  app.use(helmet());
  app.enableCors({ origin: ['http://localhost:5173'] });
  // 9.13 : `exceptionFactory` ajoute le détail par champ (`champs`) au message à plat de la partie 8.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, exceptionFactory: erreursDeValidation }));
  // 9.4 : la version dans l'URL ; une route sans @Version reste à son adresse d'origine (VERSION_NEUTRAL).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });
  // 11.9 : ici et pas dans main.ts, pour que les tests (deux instances) l'aient aussi.
  const config = app.get(ConfigService);
  app.useWebSocketAdapter(new RedisIoAdapter(app, { host: config.getOrThrow('REDIS_HOST'), port: Number(config.getOrThrow('REDIS_PORT')) }));
}
