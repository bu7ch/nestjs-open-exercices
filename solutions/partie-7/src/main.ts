import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configurerApp } from './configurer-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurerApp(app);
  const config = app.get(ConfigService);
  await app.listen(config.get('PORT') ?? 3000);
}
await bootstrap();
