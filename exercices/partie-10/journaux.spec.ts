import type { LoggerService } from '@nestjs/common';
import { vi } from 'vitest';
import type { AppAvecBase } from '../partie-5/outils.js';
import { chargerExport, lancerP10 } from './outils.js';

// 10.11 : des journaux JSON. `creerLogger` est appelée directement (en interceptant ce qu'elle écrit sur
// la sortie standard, comme le test du cours) ; les paramètres du RequeteIdMiddleware sont lus par un faux
// logger. Le branchement dans main.ts (`NestFactory.create(AppModule, { logger: creerLogger(...) })`) est
// vérifié sur ton application compilée, lancée en production (production.spec.ts).
// À faire toi-même : corriger le test du 8.5 (il doit échouer avant), et `docker compose logs api | grep`.

type CreerLogger = (production: boolean) => LoggerService & { log(message: unknown, ...reste: unknown[]): void };

const INDICE = 'Écris `export function creerLogger(production: boolean)` dans src/journal.ts : `new ConsoleLogger({ json: production, logLevels: ... })` (exercice 10.11).';

/** Ce que le logger écrit sur la sortie standard (et les erreurs) pendant `f`. */
function capturer(f: () => void): string[] {
  const ecrit: string[] = [];
  const sortie = vi.spyOn(process.stdout, 'write').mockImplementation((texte) => (ecrit.push(String(texte)), true));
  const erreurs = vi.spyOn(process.stderr, 'write').mockImplementation((texte) => (ecrit.push(String(texte)), true));
  try {
    f();
  } finally {
    sortie.mockRestore();
    erreurs.mockRestore();
  }
  return ecrit;
}

const json = (ligne: string | undefined): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(String(ligne)) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

describe('Partie 10 · Des journaux JSON (exercice 10.11)', () => {
  let creerLogger: CreerLogger;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      creerLogger = await chargerExport<CreerLogger>('creerLogger', INDICE);
      if (typeof creerLogger !== 'function') throw new Error(INDICE);
    } catch (erreur) {
      echec = erreur;
    }
  });

  it('en production : une ligne JSON par message, avec le niveau, l\'heure, le contexte et les paramètres', () => {
    const ecrit = capturer(() => creerLogger(true).log('GET /api/produits 200 3 ms [abc-123]', { requeteId: 'abc-123', statut: 200 }, 'HTTP'));
    expect(ecrit, 'une seule écriture, une seule ligne').toHaveLength(1);
    const ligne = json(ecrit[0]);
    expect(ligne, `en production, le logger écrit du JSON : \`json: production\`. Écrit : ${ecrit[0]}`).not.toBeNull();
    expect(ligne).toMatchObject({ level: 'log', message: 'GET /api/produits 200 3 ms [abc-123]', context: 'HTTP', params: { requeteId: 'abc-123', statut: 200 } });
    expect(ligne?.timestamp, 'l\'heure, en millisecondes').toEqual(expect.any(Number));
  });

  it('en production : ni debug ni verbose, mais log, warn et error', () => {
    const logger = creerLogger(true);
    const muets = capturer(() => {
      logger.debug?.('détail', 'Test');
      logger.verbose?.('encore plus de détail', 'Test');
    });
    expect(muets, 'en production, `logLevels: [\'log\', \'warn\', \'error\', \'fatal\']` : debug et verbose sont coupés').toHaveLength(0);
    const ecrits = capturer(() => {
      logger.warn('attention', 'Test');
      logger.error('panne', undefined, 'Test');
    });
    expect(ecrits.length, 'warn et error restent écrits en production').toBeGreaterThanOrEqual(2);
  });

  it('en développement : du texte, pas du JSON, et tous les niveaux', () => {
    const logger = creerLogger(false);
    const ecrit = capturer(() => logger.log('bonjour', 'Test'));
    expect(ecrit.join(''), 'en développement, le message est écrit').toContain('bonjour');
    expect(json(ecrit[0]), 'en développement, le texte coloré habituel : `json: false`').toBeNull();
    expect(capturer(() => logger.debug?.('détail', 'Test')).length, 'en développement, debug est écrit').toBeGreaterThan(0);
  });

  describe('les paramètres du RequeteIdMiddleware', () => {
    let lancee: AppAvecBase | undefined;
    const journal = vi.fn();
    beforeAll(async () => {
      try {
        lancee = await lancerP10();
        lancee.app.useLogger({ log: journal, warn: vi.fn(), error: vi.fn() });
      } catch (erreur) {
        echec = erreur;
      }
    });
    afterAll(() => lancee?.fermer());

    it('chaque requête est journalisée avec requeteId, methode, url, statut et dureeMs', async () => {
      await lancee!.http().get('/inconnue-10-11').set('X-Request-Id', 'essai-10-11');
      let appel: unknown[] | undefined;
      await vi.waitFor(
        () => {
          appel = journal.mock.calls.find((a: unknown[]) => a.some((x) => typeof x === 'string' && x.includes('essai-10-11')) || a.some((x) => (x as { requeteId?: unknown })?.requeteId === 'essai-10-11'));
          if (!appel) throw new Error('pas encore');
        },
        { timeout: 2000 },
      ).catch(() => undefined);
      expect(appel, 'aucune ligne de journal pour la requête `essai-10-11` : le RequeteIdMiddleware (8.4) journalise chaque requête avec `new Logger(\'HTTP\')`').toBeDefined();
      const params = appel!.find((x) => x && typeof x === 'object') as Record<string, unknown> | undefined;
      expect(params, 'passe un second argument au logger : `this.logger.log(message, { requeteId, methode, url, statut, dureeMs })`').toBeDefined();
      expect(params).toMatchObject({ requeteId: 'essai-10-11', methode: 'GET', url: '/inconnue-10-11', statut: 404 });
      expect(params?.dureeMs, 'dureeMs : un nombre de millisecondes').toEqual(expect.any(Number));
      expect(appel!.at(-1), 'le contexte reste le dernier argument (`HTTP`)').toBe('HTTP');
    });
  });
});
