import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurerApp } from '../src/configurer-app.js';

// 8.4 à 8.6 : l'identifiant de requête, son journal, la route de santé exclue, l'en-tête X-Serveur.
describe('Identifiant de requête (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const journal = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    // 8.5 : un faux logger, branché par la méthode prévue (espionner Logger casserait NestJS).
    app.useLogger({ log: journal, warn: vi.fn(), error: vi.fn() });
    configurerApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('génère un identifiant quand le client n\'en fournit pas', async () => {
    const reponse = await http().get('/inconnue');
    expect(reponse.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('reprend l\'identifiant fourni par le client s\'il est valide', async () => {
    const reponse = await http().get('/inconnue').set('X-Request-Id', 'front-42');
    expect(reponse.headers['x-request-id']).toBe('front-42');
  });

  it('remplace un identifiant douteux par un nouveau', async () => {
    const reponse = await http().get('/inconnue').set('X-Request-Id', '../../etc/passwd');
    expect(reponse.headers['x-request-id']).not.toBe('../../etc/passwd');
    expect(reponse.headers['x-request-id']).toHaveLength(36);
  });

  it('journalise méthode, URL, statut, durée et identifiant', async () => {
    await http().get('/inconnue').set('X-Request-Id', 'abc-123');
    // Le journal est écrit à l'événement 'finish', parfois après la réponse : on l'attend.
    await vi.waitFor(() => {
      // 10.11 : le middleware passe aussi ses paramètres (message, paramètres, contexte).
      expect(journal).toHaveBeenCalledWith(
        expect.stringMatching(/^GET \/inconnue 404 \d+ ms \[abc-123\]$/),
        expect.objectContaining({ requeteId: 'abc-123', statut: 404 }),
        'HTTP',
      );
    });
  });

  it('ne s\'applique pas à la route exclue /sante', async () => {
    const reponse = await http().get('/sante').expect(200);
    expect(reponse.body).toEqual({ data: { statut: 'ok' } });
    expect(reponse.headers['x-request-id']).toBeUndefined();
    expect(journal).not.toHaveBeenCalledWith(expect.stringContaining('/sante'), expect.anything(), 'HTTP');
  });

  it('pose X-Serveur: marketplace sur toutes les réponses, /sante comprise', async () => {
    for (const url of ['/sante', '/inconnue', '/api/produits']) {
      const reponse = await http().get(url);
      expect(reponse.headers['x-serveur']).toBe('marketplace');
    }
  });
});
