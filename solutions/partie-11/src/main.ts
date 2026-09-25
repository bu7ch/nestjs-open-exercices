import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configurerApp } from './configurer-app.js';
import { configurerSwagger } from './configurer-swagger.js';
import { creerLogger } from './journal.js';

async function bootstrap() {
  const production = process.env.NODE_ENV === 'production';
  // 10.11 : des journaux JSON en production, pour tous les `new Logger(...)` et ceux de NestJS.
  // 11.13 : `rawBody` garde le corps d'origine (la signature d'un webhook se calcule octet par octet).
  // Il se donne à la création : configurerApp reçoit une application déjà créée (les tests le répètent).
  const app = await NestFactory.create(AppModule, { logger: creerLogger(production), rawBody: true });
  configurerApp(app);
  // 9.3, 10.2 : la documentation publique, sauf en production (NODE_ENV est validée, 10.1).
  if (!production) configurerSwagger(app);
  // 10.3, 10.12 : écouter SIGTERM et SIGINT, pour finir les requêtes en cours avant de s'arrêter.
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  await app.listen(config.get('PORT') ?? 3000);
}
await bootstrap();
