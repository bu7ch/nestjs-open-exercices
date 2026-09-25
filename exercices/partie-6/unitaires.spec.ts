import {
  exigerDetection,
  exigerMention,
  exigerVert,
  localiser,
  localiserTransitions,
  parMutation,
  preparerCopie,
  specsUnitaires,
  testsTombes,
  type Copie,
  type Execution,
  type Transitions,
  type Trouve,
} from './outils.js';

// Tes tests unitaires (src/**/*.spec.ts) sont lancés dans une copie de ton projet, puis relancés avec
// un bug introduit exprès dans ton code : au moins un de tes tests doit alors échouer.

type PrixService = new () => { calculerTotal: (prixUnitaire: number, quantite: number) => number };

const INDICE_PRIX = 'Écris `PrixService` (avec sa méthode `calculerTotal(prixUnitaire, quantite)`) dans un fichier de src/, par exemple src/prix/prix.service.ts (exercice 6.1).';
const INDICE_TRANSITIONS = 'Écris `transitionner(actuel, cible)` dans src/ : une fonction exportée (par exemple dans src/commandes/transitions.ts), ou une méthode d\'une classe exportée (exercice 6.5).';

/** Les mutations de calculerTotal, et ce qu'il faut tester pour les attraper. */
const MUTATIONS_PRIX: Record<string, string> = {
  'prix:sans-remise-10': 'de 10 à 49 unités, plus de remise de 10 % (teste 10 unités)',
  'prix:sans-remise-50': 'à partir de 50 unités, 10 % de remise au lieu de 20 % (teste 50 unités)',
  'prix:remise-des-1': 'la remise de 10 % s\'applique dès 1 unité (teste 1 unité : plein tarif)',
  'prix:seuil-10-devient-11': '`>= 10` devenu `> 10` : 10 unités au plein tarif (teste la borne 10)',
  'prix:seuil-10-devient-9': 'la remise commence à 9 unités (teste la borne 9)',
  'prix:seuil-50-devient-51': '`>= 50` devenu `> 50` : 50 unités à -10 % seulement (teste la borne 50)',
  'prix:seuil-50-devient-49': 'la remise de 20 % commence à 49 unités (teste la borne 49)',
  'prix:sans-arrondi': 'le total n\'est plus arrondi au centime (teste 12 unités à 0,70 €)',
  'prix:accepte-zero': 'une quantité de 0 est acceptée (teste que 0 lève une erreur)',
  'prix:accepte-negatif': 'une quantité négative est acceptée (teste -3)',
  'prix:accepte-decimal': 'une quantité non entière est acceptée (teste 2,5)',
};

const STATUTS = ['en_attente', 'payee', 'expediee', 'livree', 'annulee'];
const AUTORISES = ['en_attente>payee', 'payee>expediee', 'expediee>livree', 'en_attente>annulee', 'payee>annulee'];
const REFUSES = STATUTS.flatMap((a) => STATUTS.filter((c) => c !== a).map((c) => `${a}>${c}`)).filter((t) => !AUTORISES.includes(t));
const mutationTransition = (genre: 'refuse' | 'autorise', t: string) => `transition:${genre}:${t.replace('>', ':')}`;

describe('Partie 6 · Tes tests unitaires (exercices 6.1 à 6.5)', () => {
  let copie: Copie | undefined;
  let prix: Trouve<PrixService> | null = null;
  let transitions: Transitions | null = null;
  let executions: Record<string, Execution> = {};

  // Si tes tests ne peuvent pas être lancés, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      prix = await localiser<PrixService>('PrixService');
      transitions = await localiserTransitions();
      copie = preparerCopie({ prix, transitions });
      const mutations = [
        'aucune',
        ...(prix ? Object.keys(MUTATIONS_PRIX) : []),
        ...(transitions ? [...AUTORISES.map((t) => mutationTransition('refuse', t)), ...REFUSES.map((t) => mutationTransition('autorise', t))] : []),
      ];
      executions = parMutation(await copie.executer('unitaires', mutations));
    } catch (erreur) {
      echec = erreur;
    }
  }, 600_000);
  afterAll(() => copie?.nettoyer());

  const service = () => {
    if (!prix) throw new Error(`Aucun fichier de src/ n'exporte \`PrixService\`. ${INDICE_PRIX}`);
    return new prix.valeur();
  };

  /** Tes tests passent sans mutation, et il y en a sur `nom` (sinon : message clair). */
  function exigerTestsVerts(nom: string, indice: string) {
    exigerVert(executions.aucune, 'src/**/*.spec.ts', indice);
    exigerMention(specsUnitaires(), nom, 'src/**/*.spec.ts', indice);
  }

  const exigerPrix = (...mutations: string[]) => {
    if (!prix) throw new Error(`Aucun fichier de src/ n'exporte \`PrixService\`. ${INDICE_PRIX}`);
    exigerTestsVerts('calculerTotal', 'Écris tes tests de calculerTotal dans un fichier .spec.ts à côté du service (exercice 6.1).');
    for (const m of mutations) exigerDetection(executions, m, MUTATIONS_PRIX[m]!);
  };

  describe('6.1 · les paliers de prix', () => {
    it('calculerTotal : 1, 10 et 50 unités à 100 € donnent 100, 900 et 4000', () => {
      const s = service();
      expect(s.calculerTotal(100, 1), 'plein tarif de 1 à 9 unités').toBe(100);
      expect(s.calculerTotal(100, 10), '10 % de remise de 10 à 49 unités').toBe(900);
      expect(s.calculerTotal(100, 50), '20 % de remise à partir de 50 unités').toBe(4000);
    });

    it('tes tests passent, et attrapent un palier cassé (1, 10 et 50 unités)', () => {
      exigerPrix('prix:sans-remise-10', 'prix:sans-remise-50', 'prix:remise-des-1');
    });
  });

  describe('6.2 · les bornes', () => {
    it('1, 9, 10, 49, 50 et 100 unités à 100 € donnent 100, 900, 900, 4410, 4000 et 8000', () => {
      const s = service();
      for (const [quantite, attendu] of [[1, 100], [9, 900], [10, 900], [49, 4410], [50, 4000], [100, 8000]] as const) {
        expect(s.calculerTotal(100, quantite), `${quantite} unités à 100 €`).toBe(attendu);
      }
    });

    it('tes tests attrapent un seuil décalé d\'une unité (bornes 9, 10, 49 et 50)', () => {
      exigerPrix('prix:seuil-10-devient-11', 'prix:seuil-10-devient-9', 'prix:seuil-50-devient-51', 'prix:seuil-50-devient-49');
    });
  });

  describe('6.3 · l\'arrondi au centime', () => {
    it('12 unités à 0,70 € donnent exactement 7.56', () => {
      expect(service().calculerTotal(0.7, 12), 'arrondis au centime : Math.round(total * 100) / 100').toBe(7.56);
    });

    it('tes tests attrapent un total qui n\'est plus arrondi', () => {
      exigerPrix('prix:sans-arrondi');
    });
  });

  describe('6.4 · les quantités invalides', () => {
    it('0, -3 et 2,5 lèvent une erreur qui contient « entier positif »', () => {
      const s = service();
      for (const quantite of [0, -3, 2.5]) {
        expect(() => s.calculerTotal(100, quantite), `quantité ${quantite}`).toThrow('entier positif');
      }
    });

    it('tes tests attrapent une quantité de 0, négative ou non entière acceptée', () => {
      exigerPrix('prix:accepte-zero', 'prix:accepte-negatif', 'prix:accepte-decimal');
    });
  });

  describe('6.5 · les transitions d\'une commande', () => {
    const exigerTransitions = () => {
      if (!transitions) throw new Error(`\`transitionner\` introuvable. ${INDICE_TRANSITIONS}`);
      return transitions;
    };

    it('transitionner autorise les passages prévus et renvoie le nouveau statut', () => {
      const t = exigerTransitions();
      for (const passage of AUTORISES) {
        const [actuel, cible] = passage.split('>') as [string, string];
        expect(t.appeler(actuel, cible), `${actuel} vers ${cible} est autorisé`).toBe(cible);
      }
    });

    it('transitionner refuse les autres, avec « Passage impossible : … vers … »', () => {
      const t = exigerTransitions();
      for (const passage of ['livree>annulee', 'en_attente>livree', 'expediee>annulee', 'annulee>payee', 'livree>en_attente', 'payee>en_attente']) {
        const [actuel, cible] = passage.split('>') as [string, string];
        let erreur: unknown;
        try {
          t.appeler(actuel, cible);
        } catch (e) {
          erreur = e;
        }
        expect(erreur, `${actuel} vers ${cible} doit lever une erreur`).toBeInstanceOf(Error);
        const message = (erreur as Error).message;
        expect(message, `${actuel} vers ${cible}`).toContain('Passage impossible');
        expect(message.includes(actuel) && message.includes(cible), `le message nomme les deux statuts : « Passage impossible : ${actuel} vers ${cible} » (reçu : « ${message} »)`).toBe(true);
      }
    });

    it('tes tests attrapent livree → annulee et en_attente → livree autorisés à tort', () => {
      exigerTransitions();
      exigerTestsVerts('transitionner', 'Écris tes tests de transitionner avec it.each (exercice 6.5).');
      exigerDetection(executions, mutationTransition('autorise', 'livree>annulee'), 'livree vers annulee est autorisé');
      exigerDetection(executions, mutationTransition('autorise', 'en_attente>livree'), 'en_attente vers livree est autorisé');
    });

    it('tes tests couvrent au moins quatre passages autorisés et quatre refusés', () => {
      exigerTransitions();
      exigerTestsVerts('transitionner', 'Écris tes tests de transitionner avec it.each (exercice 6.5).');
      const autorisesTestes = AUTORISES.filter((t) => testsTombes(executions[mutationTransition('refuse', t)]!).length > 0);
      const refusesTestes = REFUSES.filter((t) => testsTombes(executions[mutationTransition('autorise', t)]!).length > 0);
      if (autorisesTestes.length < 4) {
        throw new Error(`Quand on interdit un passage autorisé, tes tests ne le voient que pour : ${autorisesTestes.join(', ') || 'aucun'}. Teste au moins quatre des passages ${AUTORISES.join(', ')}.`);
      }
      if (refusesTestes.length < 4) {
        throw new Error(`Quand on autorise un passage interdit, tes tests ne le voient que pour : ${refusesTestes.join(', ') || 'aucun'}. Teste au moins quatre passages refusés (qui lèvent « Passage impossible »).`);
      }
    });
  });
});
