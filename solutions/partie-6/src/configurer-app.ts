import { INestApplication, ValidationPipe } from '@nestjs/common';

// 6.11 : toute la configuration de l'application, appelée par main.ts ET par les tests.
export function configurerApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
}
