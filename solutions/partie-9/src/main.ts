import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configurerApp } from './configurer-app.js';
import { configurerSwagger } from './configurer-swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurerApp(app);
  // 9.3 : la politique de la marketplace : documentation publique, sauf en production.
  if (process.env.NODE_ENV !== 'production') configurerSwagger(app);
  const config = app.get(ConfigService);
  await app.listen(config.get('PORT') ?? 3000);
}
await bootstrap();
