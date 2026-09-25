import { creerLogger } from './journal.js';

// 10.11 : le format se teste sans application, en interceptant ce que le logger écrit.
describe('creerLogger', () => {
  let ecrit: string[];

  beforeEach(() => {
    ecrit = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((texte) => {
      ecrit.push(String(texte));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('en production, écrit une ligne JSON par message, avec le contexte et les paramètres', () => {
    creerLogger(true).log('GET /api/produits 200 3 ms [abc-123]', { requeteId: 'abc-123', statut: 200 }, 'HTTP');

    expect(ecrit).toHaveLength(1);
    expect(JSON.parse(ecrit[0]!)).toEqual({
      level: 'log',
      pid: process.pid,
      timestamp: expect.any(Number),
      message: 'GET /api/produits 200 3 ms [abc-123]',
      context: 'HTTP',
      params: { requeteId: 'abc-123', statut: 200 },
    });
  });

  it('en production, ignore les niveaux debug et verbose', () => {
    const logger = creerLogger(true);
    logger.debug('détail', 'Test');
    logger.verbose('encore plus de détail', 'Test');
    expect(ecrit).toHaveLength(0);
  });

  it('en développement, écrit du texte, pas du JSON', () => {
    creerLogger(false).log('bonjour', 'Test');
    expect(() => JSON.parse(ecrit[0]!)).toThrow();
    expect(ecrit[0]).toContain('bonjour');
  });
});
