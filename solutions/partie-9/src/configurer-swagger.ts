import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// 9.1 : la documentation OpenAPI, générée depuis les contrôleurs et les DTO. Isolée dans une fonction,
// comme configurerApp (6.11), pour que les tests l'appellent aussi, AVANT app.init() (après, /docs répond 404).
export function configurerSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('API Marketplace')
    .setDescription('Catalogue de produits, vendeurs, commandes et comptes de la marketplace.')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  return document;
}
