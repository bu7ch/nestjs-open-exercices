import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 8.14 : un format d'erreur unique ; 8.15 : les erreurs de la base traduites par le filtre ;
// 8.13 : les réponses réussies enveloppées, les 204 toujours vides.
describe('Erreurs et réponses (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let bearer: string;

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
  });

  beforeEach(async () => {
    await viderLaBase(dataSource);
    ({ bearer } = await compteConnecte(http, dataSource, 'vendeur@exemple.fr', 'vendeur'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('met toutes les erreurs au même format, avec l\'identifiant de la requête', async () => {
    const reponse = await http().get('/api/introuvable').set('Authorization', bearer).set('X-Request-Id', 'abc-123').expect(404);
    expect(reponse.body).toEqual({
      statusCode: 404,
      message: 'Cannot GET /api/introuvable',
      chemin: '/api/introuvable',
      horodatage: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      requeteId: 'abc-123',
    });
    expect(reponse.headers['x-request-id']).toBe('abc-123');
  });

  it('garde le détail de chaque règle violée pour une validation (400)', async () => {
    const reponse = await http().post('/api/vendeurs').set('Authorization', bearer).send({ nom: '' }).expect(400);
    expect(reponse.body.message).toEqual(['nom should not be empty']);
  });

  it('transforme une inscription en double en 409, sans try/catch dans le service', async () => {
    const reponse = await http().post('/api/auth/inscription').send({ email: 'vendeur@exemple.fr', motDePasse: 'UnAutreMotDePasse' }).expect(409);
    expect(reponse.body.message).toBe('Cette ressource existe déjà');
  });

  it('transforme la suppression d\'un vendeur commandé en 409', async () => {
    await http().post('/api/vendeurs').set('Authorization', bearer).send({ nom: 'Atelier' }).expect(201);
    await http().post('/api/vendeurs/1/produits').set('Authorization', bearer).send({ nom: 'Lampe', prix: 30, categorie: 'mobilier' }).expect(201);
    await http().post('/api/produits/1/variantes').set('Authorization', bearer).send({ nom: 'Rouge' }).expect(201);
    await http().post('/api/commandes').set('Authorization', bearer).send({ lignes: [{ varianteId: 1, quantite: 1 }] }).expect(201);
    const reponse = await http().delete('/api/vendeurs/1').set('Authorization', bearer).expect(409);
    expect(reponse.body.message).toBe('Cette ressource est liée à d\'autres données');
  });

  it('enveloppe les réponses réussies dans { data }, et laisse les 204 sans contenu', async () => {
    const creation = await http().post('/api/vendeurs').set('Authorization', bearer).send({ nom: 'Atelier' }).expect(201);
    expect(creation.body).toEqual({ data: { id: 1, nom: 'Atelier' } });
    const suppression = await http().delete('/api/vendeurs/1').set('Authorization', bearer).expect(204);
    expect(suppression.body).toEqual({});
    expect(suppression.text).toBe('');
  });
});
