import { INestApplication, ValidationPipe, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { erreursDeValidation } from './commun/erreurs.js';

// 6.11 : toute la configuration de l'application, appelée par main.ts ET par les tests.
export function configurerApp(app: INestApplication) {
  // 7.20 : des en-têtes de sécurité (et plus de X-Powered-By), et seulement l'origine du front.
  app.use(helmet());
  app.enableCors({ origin: ['http://localhost:5173'] });
  // 9.13 : `exceptionFactory` ajoute le détail par champ (`champs`) au message à plat de la partie 8.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, exceptionFactory: erreursDeValidation }));
  // 9.4 : la version dans l'URL ; une route sans @Version reste à son adresse d'origine (VERSION_NEUTRAL).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });
}
