import { readFileSync } from 'node:fs';
import { existe, importer } from '../aide.js';
import { detail } from '../partie-4/outils.js';
import { lancerAvecBase, type AppAvecBase } from '../partie-5/outils.js';
import { exigerDetection, exigerMention, exigerVert, localiser, parMutation, preparerCopie, specsE2e, type Copie, type Execution } from './outils.js';

// 6.9 à 6.11 : ta route POST /api/prix/total (testée ici directement), puis TES tests de bout en bout
// (test/**/*.e2e-spec.ts), lancés dans une copie de ton projet, sans puis avec des bugs introduits
// exprès dans l'application qu'ils démarrent.

const INDICE_E2E = 'Écris tes tests de bout en bout dans test/, avec le suffixe .e2e-spec.ts (par exemple test/prix.e2e-spec.ts), avec Supertest (exercice 6.9).';

const MUTATIONS: Record<string, string> = {
  'http:quantite-zero-acceptee': 'POST /api/prix/total accepte une quantité de 0 (201) : teste qu\'elle est refusée avec un 400',
  'http:champ-en-trop-accepte': 'POST /api/prix/total accepte un champ en trop : teste qu\'il est refusé avec un 400',
  'http:total-faux': 'POST /api/prix/total renvoie un total faux (+1) : vérifie le corps de la réponse, `{ total: 900 }`',
  'configurer-app:vide': 'configurerApp ne fait plus rien (plus de ValidationPipe) : ton test doit appeler configurerApp(app), comme main.ts',
};

/** La route du prix : `/api/prix/total`, ou `/v1/api/prix/total` si tu as gardé le préfixe global du 6.11. */
async function routePrix(http: AppAvecBase['http']): Promise<string> {
  const essai = await http().post('/api/prix/total').send({ prixUnitaire: 100, quantite: 10 });
  if (essai.status !== 404) return '/api/prix/total';
  const avecPrefixe = await http().post('/v1/api/prix/total').send({ prixUnitaire: 100, quantite: 10 });
  return avecPrefixe.status === 404 ? '/api/prix/total' : '/v1/api/prix/total';
}

describe('Partie 6 · Les tests de bout en bout (exercices 6.9 à 6.11)', () => {
  describe('6.9 · la route POST /api/prix/total', () => {
    let lancee: AppAvecBase;
    let route: string;
    let echec: unknown;
    beforeEach(() => {
      if (echec) throw echec;
    });
    beforeAll(async () => {
      try {
        lancee = await lancerAvecBase();
        route = await routePrix(lancee.http);
      } catch (erreur) {
        echec = erreur;
      }
    });
    afterAll(() => lancee?.fermer());

    it('renvoie { total: 900 } pour 10 unités à 100 €', async () => {
      const r = await lancee.http().post(route).send({ prixUnitaire: 100, quantite: 10 });
      expect(r.status, 'ajoute `POST /api/prix/total` (un PrixController, dans un module importé par AppModule), qui appelle PrixService.calculerTotal').toBeOneOf([200, 201]);
      expect(r.body).toEqual({ total: 900 });
    });

    it('refuse une quantité de 0, négative ou non entière (400)', async () => {
      for (const quantite of [0, -2, 2.5, 'dix']) {
        const r = await lancee.http().post(route).send({ prixUnitaire: 100, quantite });
        expect(r.status, `quantite: ${JSON.stringify(quantite)} : \`@IsInt() @Min(1)\` sur quantite (sinon PrixService lève une erreur, et c'est un 500)`).toBe(400);
        expect(detail(r.body)).toContain('quantite');
      }
    });

    it('refuse un prix unitaire négatif ou qui n\'est pas un nombre (400)', async () => {
      for (const prixUnitaire of [-1, 'cent']) {
        const r = await lancee.http().post(route).send({ prixUnitaire, quantite: 10 });
        expect(r.status, `prixUnitaire: ${JSON.stringify(prixUnitaire)} : \`@IsNumber() @Min(0)\` sur prixUnitaire`).toBe(400);
        expect(detail(r.body)).toContain('prixUnitaire');
      }
    });

    it('refuse un champ en trop (400)', async () => {
      const r = await lancee.http().post(route).send({ prixUnitaire: 100, quantite: 10, remise: 50 });
      expect(r.status, 'le ValidationPipe avec whitelist et forbidNonWhitelisted').toBe(400);
      expect(detail(r.body)).toContain('remise');
    });
  });

  describe('tes tests de bout en bout', () => {
    let copie: Copie | undefined;
    let executions: Record<string, Execution> = {};
    let echec: unknown;
    beforeEach(() => {
      if (echec) throw echec;
    });
    beforeAll(async () => {
      try {
        copie = preparerCopie({ prix: await localiser('PrixService') });
        executions = parMutation(await copie.executer('e2e', ['aucune', ...Object.keys(MUTATIONS)]));
      } catch (erreur) {
        echec = erreur;
      }
    }, 600_000);
    afterAll(() => copie?.nettoyer());

    const exigerTestsVerts = () => {
      exigerVert(executions.aucune, 'test/**/*.e2e-spec.ts', INDICE_E2E);
      exigerMention(specsE2e(), 'prix/total', 'test/**/*.e2e-spec.ts', INDICE_E2E);
    };

    it('6.9 · ton test e2e vérifie le total renvoyé par POST /api/prix/total', () => {
      exigerTestsVerts();
      exigerDetection(executions, 'http:total-faux', MUTATIONS['http:total-faux']!);
    });

    it('6.9 · ton test e2e vérifie qu\'une quantité de 0 est refusée (400)', () => {
      exigerTestsVerts();
      exigerDetection(executions, 'http:quantite-zero-acceptee', MUTATIONS['http:quantite-zero-acceptee']!);
    });

    it('6.9 · ton test e2e vérifie qu\'un champ en trop est refusé (400)', () => {
      exigerTestsVerts();
      exigerDetection(executions, 'http:champ-en-trop-accepte', MUTATIONS['http:champ-en-trop-accepte']!);
    });

    it('6.11 · ton test e2e configure l\'application avec configurerApp', () => {
      if (!existe('configurer-app')) throw new Error('Fichier attendu : src/configurer-app.ts, qui exporte `configurerApp(app)` (exercice 6.11).');
      exigerTestsVerts();
      exigerDetection(executions, 'configurer-app:vide', MUTATIONS['configurer-app:vide']!);
    });
  });

  describe('6.11 · une seule configuration pour l\'appli et les tests', () => {
    it('src/configurer-app.ts exporte configurerApp, et main.ts l\'appelle', async () => {
      const { configurerApp } = await importer<{ configurerApp?: unknown }>('configurer-app', 'Extrais la configuration de main.ts dans `export function configurerApp(app)` (exercice 6.11).');
      expect(typeof configurerApp, 'src/configurer-app.ts doit exporter la fonction `configurerApp`').toBe('function');
      const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
      expect(main.includes('configurerApp('), 'main.ts doit appeler `configurerApp(app)` (et ne plus configurer le ValidationPipe lui-même)').toBe(true);
    });

    it('le serveur lancé par main.ts refuse toujours une quantité de 0 (400)', async () => {
      const lancee = await lancerAvecBase({ via: 'main' });
      try {
        const route = await routePrix(lancee.http);
        const r = await lancee.http().post(route).send({ prixUnitaire: 100, quantite: 0 });
        expect(r.status, 'main.ts doit appeler configurerApp(app), qui installe le ValidationPipe').toBe(400);
      } finally {
        await lancee.fermer();
      }
    });
  });
});
