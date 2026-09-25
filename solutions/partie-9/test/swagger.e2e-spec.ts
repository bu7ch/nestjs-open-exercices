import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { demarrerApp } from './app-de-test.js';

// 9.3 : la documentation se teste comme le reste ; 9.14 : les erreurs documentées ; 9.15 : le contrat figé.
describe('Documentation OpenAPI (e2e)', () => {
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let document: OpenAPIObject;

  beforeAll(async () => {
    ({ app, http, document } = await demarrerApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('a un titre et décrit les routes', () => {
    expect(document.info.title).toBe('API Marketplace');
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/api/produits', '/v2/api/produits', '/api/produits/{id}', '/api/classement-vendeurs']));
    expect(document.paths['/api/produits/{id}']?.get?.summary).toBe('Détail d\'un produit');
  });

  it('déclare l\'authentification par jeton, sauf sur les routes publiques', () => {
    expect(document.components?.securitySchemes).toHaveProperty('bearer');
    expect(document.paths['/api/produits/{id}']?.get?.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/api/auth/connexion']?.post?.security).toBeUndefined();
  });

  it('sert l\'interface sur /docs et le JSON sur /docs-json, sans jeton', async () => {
    await http().get('/docs').expect(200);
    const json = await http().get('/docs-json').expect(200);
    expect(json.body.info.title).toBe('API Marketplace');
  });

  it('9.5 : la v1 est marquée obsolète', () => {
    expect(document.paths['/api/produits']?.get?.deprecated).toBe(true);
    expect(document.paths['/v2/api/produits']?.get?.deprecated).toBeUndefined();
  });

  it('9.8 : les schémas de la page existent (ApiExtraModels)', () => {
    expect(document.components?.schemas).toHaveProperty('MetaPage');
    expect(document.components?.schemas).toHaveProperty('ProduitReponseDto');
  });

  it('9.14 : la documentation annonce les erreurs du détail', () => {
    const reponses = document.paths['/api/produits/{id}']?.get?.responses as Record<string, unknown>;
    expect(Object.keys(reponses)).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(document.components?.schemas).toHaveProperty('ErreurDto');
  });

  it('9.15 : le contrat est figé dans un fichier : toute modification de l\'API doit y être visible', async () => {
    await expect(JSON.stringify(document, null, 2)).toMatchFileSnapshot('./openapi.snapshot.json');
  });
});
