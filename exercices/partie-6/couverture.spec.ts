import { exigerDetection, exigerVert, fichiersSource, localiser, localiserTransitions, parMutation, preparerCopie, type Copie, type Couverture, type Execution, type Trouve } from './outils.js';

// 6.15 et 6.16 : `npm run test:cov` (ta configuration vitest.config.unit.ts, avec la couverture) est
// lancé dans une copie de ton projet ; on lit le résumé de couverture par fichier.

const EXCLUS = [/^src\/main\.ts$/, /\.module\.ts$/, /\.dto\.ts$/, /\.entity\.ts$/, /^src\/data-source\.ts$/];

describe('Partie 6 · La couverture (exercices 6.15 et 6.16)', () => {
  let copie: Copie | undefined;
  let couverture: Couverture | undefined;
  let executions: Record<string, Execution> = {};
  let prix: Trouve | null = null;
  const dejaTestes: string[] = [];

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      prix = await localiser('PrixService');
      const transitions = await localiserTransitions();
      const produits = await localiser('ProduitsService');
      dejaTestes.push(...[prix?.fichier, transitions?.fichier, produits?.fichier].filter((f): f is string => Boolean(f)));
      copie = preparerCopie({ prix });
      couverture = await copie.couverture();
      if (prix) executions = parMutation(await copie.executer('unitaires', ['aucune', 'prix:remise-0-9']));
    } catch (erreur) {
      echec = erreur;
    }
  }, 300_000);
  afterAll(() => copie?.nettoyer());

  const resume = () => {
    if (!couverture?.resume) throw new Error('`npm run test:cov` n\'a produit aucun rapport de couverture : vérifie que vitest.config.unit.ts existe et que tes tests unitaires se lancent.');
    return couverture.resume;
  };

  describe('6.15 · compter tous les fichiers', () => {
    it('coverage.include : les fichiers qu\'aucun test n\'importe (contrôleurs, services) apparaissent dans le rapport', () => {
      const mesures = Object.keys(resume());
      const attendus = fichiersSource().filter((f) => /\.(controller|service)\.ts$/.test(f));
      const absents = attendus.filter((f) => !mesures.includes(f));
      expect(absents, 'ajoute `coverage: { include: [\'src/**/*.ts\'], exclude: [...] }` dans vitest.config.unit.ts : sans lui, seuls les fichiers importés par tes tests sont comptés').toEqual([]);
    });

    it('coverage.exclude : main.ts, les modules, les DTO, les entités et data-source.ts ne sont pas comptés', () => {
      const comptes = Object.keys(resume()).filter((f) => EXCLUS.some((e) => e.test(f)));
      expect(comptes, 'ajoute les `exclude` de la section : src/main.ts, src/**/*.module.ts, src/**/*.dto.ts, src/**/*.entity.ts, src/data-source.ts').toEqual([]);
    });

    it('un fichier de plus, choisi par toi, est entièrement couvert (plus aucune ligne non couverte)', () => {
      const r = resume();
      const complets = Object.entries(r).filter(([f, c]) => f !== 'total' && !dejaTestes.includes(f) && c.lines.total > 0 && c.lines.pct === 100);
      expect(
        complets.map(([f]) => f),
        `en dehors des fichiers des exercices 6.1 à 6.6 (${dejaTestes.join(', ')}), aucun fichier n'a toutes ses lignes couvertes : choisis un fichier à 0 % et écris les tests qui manquent`,
      ).not.toHaveLength(0);
    });
  });

  describe('6.16 · un test qui ne protège rien', () => {
    it('un seuil `lines: 80` (au moins) dans vitest.config.unit.ts', async () => {
      const config = await copie!.config('vitest.config.unit.ts');
      if (!config) throw new Error('Fichier attendu : vitest.config.unit.ts, à la racine du dépôt.');
      expect(config.coverage.thresholds?.lines, 'ajoute `thresholds: { lines: 80 }` dans le bloc `coverage`').toBeGreaterThanOrEqual(80);
    });

    it('ta vraie suite attrape la remise cassée (0,2 devenu 0,9)', () => {
      if (!prix) throw new Error('Aucun fichier de src/ n\'exporte `PrixService` (exercice 6.1).');
      exigerVert(executions.aucune, 'src/**/*.spec.ts', 'Tes tests unitaires doivent passer (exercices 6.1 à 6.4).');
      exigerDetection(executions, 'prix:remise-0-9', 'la remise de 20 % devient 90 % à partir de 50 unités : un test sans `expect` ne le voit pas, tes tests des exercices 6.1 et 6.2 si');
    });
  });
});
