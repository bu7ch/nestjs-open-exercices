import { exigerDetection, exigerMention, exigerVert, localiser, parMutation, preparerCopie, specsUnitaires, type Copie, type Execution, type Trouve } from './outils.js';

// Ton test de ProduitsService (6.6) est lancé sans base de données (elle est injoignable pendant tes
// tests unitaires), puis relancé avec un bug introduit dans ProduitsService : tes doublures doivent
// permettre de le voir. Les mutations passent par les dépendances que reçoit le constructeur du service
// (tes doublures) : elles ne supposent rien de tes noms de méthodes.

const INDICE = 'Teste ProduitsService dans un fichier .spec.ts à côté de lui (par exemple src/produits/produits.service.spec.ts), avec `Test.createTestingModule`, un faux repository et `{ provide: ConfigService, useValue: { get: vi.fn() } }` (exercice 6.6).';

const MUTATIONS: Record<string, string> = {
  'produits:sans-save': 'sous la limite, le produit n\'est plus enregistré (`save` n\'est plus appelé) : vérifie que `save` reçoit le produit, ou que le service renvoie ce que `save` a renvoyé',
  'produits:sans-limite': 'la limite NOMBRE_MAX_PRODUITS est ignorée : vérifie qu\'à la limite, une BadRequestException est levée',
  'produits:save-malgre-la-limite': 'à la limite, le produit est enregistré quand même avant l\'erreur : vérifie que `save` n\'est pas appelé (`not.toHaveBeenCalled()`)',
  'produits:compte-sans-limite': 'sans limite configurée, les produits sont comptés quand même : vérifie que `count` n\'est jamais appelé',
};

describe('Partie 6 · Le module de test et les doublures (exercice 6.6)', () => {
  let copie: Copie | undefined;
  let produits: Trouve | null = null;
  let executions: Record<string, Execution> = {};

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      produits = await localiser('ProduitsService');
      copie = preparerCopie({ produits });
      executions = parMutation(await copie.executer('unitaires', ['aucune', ...(produits ? Object.keys(MUTATIONS) : [])]));
    } catch (erreur) {
      echec = erreur;
    }
  }, 300_000);
  afterAll(() => copie?.nettoyer());

  const exiger = (...mutations: string[]) => {
    if (!produits) throw new Error('Aucun fichier de src/ n\'exporte `ProduitsService` (partie 3).');
    exigerVert(executions.aucune, 'src/**/*.spec.ts, sans base de données', INDICE);
    exigerMention(specsUnitaires(), 'ProduitsService', 'src/**/*.spec.ts', INDICE);
    exigerMention(specsUnitaires(), 'ConfigService', 'src/**/*.spec.ts', `Un faux ConfigService : ${INDICE}`);
    for (const m of mutations) exigerDetection(executions, m, MUTATIONS[m]!);
  };

  it('6.6 · sous la limite, ton test vérifie que le produit est enregistré', () => {
    exiger('produits:sans-save');
  });

  it('6.6 · à la limite, ton test attend une BadRequestException, sans appel à save', () => {
    exiger('produits:sans-limite', 'produits:save-malgre-la-limite');
  });

  it('6.6 · sans limite configurée, ton test vérifie que count n\'est jamais appelé', () => {
    exiger('produits:compte-sans-limite');
  });
});
