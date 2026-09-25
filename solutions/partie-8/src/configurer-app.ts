import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

// 6.11 : toute la configuration de l'application, appelée par main.ts ET par les tests.
export function configurerApp(app: INestApplication) {
  // 7.20 : des en-têtes de sécurité (et plus de X-Powered-By), et seulement l'origine du front.
  app.use(helmet());
  app.enableCors({ origin: ['http://localhost:5173'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
}
