import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { SECRET, SECRET_REFRESH } from '../partie-7/outils.js';
import { exigerDetection, exigerVert, parMutation, preparerCopie, specsE2e, specsUnitaires, type Copie, type Execution } from '../partie-6/outils.js';
import { cartographier, cleDeMetadonnee, exportDe, exportNomme, trouverRoute, type Carte } from './outils.js';

// Les exercices où le cours te fait écrire des tests précis (8.4, 8.10, 8.11, 8.14, 8.16) sont jugés
// comme en partie 6 : ton projet est copié dans un dossier temporaire, tes tests y tournent, puis ils
// sont relancés avec un bug introduit exprès dans ton code (voir mutations.ts) : au moins un doit tomber.
// Les tests de l'ordre du cycle de vie (8.1 à 8.3) et du journal (8.5) ne sont pas jugés : à toi de les
// écrire et de les regarder tourner.

type Cible = { fichier: string; export: string; cle?: string };

const INDICE_UNITAIRES = 'Écris tes tests unitaires dans src/, à côté du code (`*.spec.ts`), comme en partie 6.';
const INDICE_E2E = 'Écris tes tests de bout en bout dans test/ (`*.e2e-spec.ts`), comme en partie 6 ; ceux qui parlent de `X-Request-Id` sont lancés ici (8.4, 8.14).';

const MUTATIONS_UNITAIRES: Record<string, string> = {
  'statut:refus-ignore': 'ton guard de statut laisse passer une commande qui n\'a pas le statut exigé (teste le cas refusé)',
  'statut:message-muet': 'le refus ne dit plus le statut actuel de la commande (vérifie le message du refus)',
  'statut:route-libre-refusee': 'une route SANS `@StatutRequis` est refusée (teste une vraie méthode non décorée : le guard doit renvoyer true)',
  'statut:id-en-base': 'un identifiant absurde (`abc`) part en base puis donne un 404 (teste la BadRequestException, et que la base n\'est pas interrogée)',
  'statut:introuvable-passe': 'une commande introuvable laisse passer (teste la NotFoundException)',
  'interne:rien-masque': 'l\'interceptor ne masque plus rien (teste qu\'un autre vendeur, ou un acheteur, ne voit pas le champ)',
  'interne:tout-masque': 'l\'interceptor masque le champ pour tout le monde (teste que le propriétaire le voit)',
  'interne:origine-modifiee': 'l\'interceptor supprime le champ DANS la réponse d\'origine (vérifie qu\'elle n\'est pas modifiée)',
  'filtre:secret-revele': 'un 500 renvoie le message de l\'erreur (et sa pile) au client (vérifie que le faux secret n\'est pas dans la réponse)',
  'filtre:500-non-journalisee': 'une erreur 500 n\'est plus journalisée (vérifie que le secret apparaît dans l\'appel à `logger.error`)',
  'filtre:4xx-journalisee': 'une erreur 4xx est journalisée comme un incident (vérifie que `logger.error` n\'est pas appelé)',
};

const MUTATIONS_E2E: Record<string, string> = {
  'middleware:ne-genere-rien': 'sans identifiant du client, la réponse n\'a plus d\'en-tête X-Request-Id (teste l\'identifiant généré)',
  'middleware:ignore-le-client': 'l\'identifiant valide du client (`front-42`) est remplacé par un nouveau (teste qu\'il est repris)',
  'middleware:accepte-le-douteux': 'un identifiant douteux (`../../etc/passwd`) est repris tel quel (teste qu\'il est remplacé)',
  'filtre:sans-requeteId': 'la réponse d\'erreur n\'a plus de `requeteId` (vérifie le format complet d\'une route inconnue)',
  'filtre:message-aplati': 'le tableau des règles violées devient une seule chaîne (vérifie le message d\'une validation ratée)',
};

/** Les variables que tes tests trouvent d'habitude dans ton .env.test : on ne fournit que celles qui y manquent. */
function variablesManquantes(): Record<string, string> {
  const fichier = new URL('../../.env.test', import.meta.url).pathname;
  const tiennes = existsSync(fichier) ? parseEnv(readFileSync(fichier, 'utf8')) : {};
  const nos = { NOMBRE_MAX_PRODUITS: '1000', JWT_SECRET: SECRET, JWT_REFRESH_SECRET: SECRET_REFRESH, THROTTLE_ACTIF: 'false' };
  return Object.fromEntries(Object.entries(nos).filter(([cle]) => tiennes[cle] === undefined));
}

/** Les classes visées par les mutations, retrouvées dans ton code (null : pas encore écrite). */
function cibles(carte: Carte): Record<'middleware' | 'filtre' | 'statut' | 'interne', Cible | null> {
  const nommee = (nom: string): Cible | null => {
    const e = exportNomme(carte, nom);
    return e ? { fichier: e.fichier, export: e.nom } : null;
  };
  const globaux = new Set<Function>([...carte.globaux.gardes, ...carte.globaux.interceptors]);

  // Le guard de `POST /api/commandes/:id/expedier` (8.7), et la clé que pose `@StatutRequis`.
  let statut: Cible | null = null;
  const expedier = trouverRoute(carte, 'POST', 'api/commandes/:id/expedier');
  const garde = expedier?.gardes.find((g) => !globaux.has(g) && exportDe(carte, g));
  if (garde) {
    const e = exportDe(carte, garde)!;
    statut = { fichier: e.fichier, export: e.nom, cle: cleDeMetadonnee(exportNomme(carte, 'StatutRequis')?.valeur, 'payee') };
  }

  // L'interceptor appliqué à `GET /api/produits` et `GET /api/produits/:id` (8.11).
  let interne: Cible | null = null;
  const routes = [trouverRoute(carte, 'GET', 'api/produits'), trouverRoute(carte, 'GET', 'api/produits/:id')];
  const communs = (routes[0]?.interceptors ?? []).filter((i) => routes[1]?.interceptors.includes(i) && !globaux.has(i) && i.name !== 'DelaiMaximalInterceptor');
  const choisi = communs.find((i) => exportDe(carte, i));
  if (choisi) {
    const e = exportDe(carte, choisi)!;
    interne = { fichier: e.fichier, export: e.nom };
  }
  return { middleware: nommee('RequeteIdMiddleware'), filtre: nommee('ToutesExceptionsFilter'), statut, interne };
}

/** Au moins un de tes fichiers parle de `motif` (sinon : l'indice). */
function exigerMention(specs: Record<string, string>, motif: RegExp, quoi: string, indice: string): void {
  if (!Object.values(specs).some((s) => motif.test(s))) throw new Error(`Aucun de tes fichiers ${quoi} ne parle de ${motif.source.replace(/\\/g, '')}. ${indice}`);
}

describe('Partie 8 · Tes tests, jugés par mutation (exercices 8.4, 8.10, 8.11, 8.14, 8.16)', () => {
  let copie: Copie | undefined;
  let trouvees: ReturnType<typeof cibles> | undefined;
  let unitaires: Record<string, Execution> = {};
  let e2e: Record<string, Execution> = {};
  let fichiersE2e: string[] = [];
  // Tes tests unitaires et tes tests e2e sont lancés séparément : l'échec des uns ne masque pas les autres.
  let echecUnitaires: unknown;
  let echecE2e: unknown;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      trouvees = cibles(await cartographier());
      const plan = { cibles8: Object.fromEntries(Object.entries(trouvees).filter(([, c]) => c)) };
      copie = preparerCopie({}, { mutations: 'exercices/partie-8/mutations.ts', plan, env: variablesManquantes() });

      const actives = (liste: Record<string, string>) =>
        Object.keys(liste).filter((m) => {
          const [genre] = m.split(':');
          return genre === 'statut' ? !!trouvees!.statut : genre === 'interne' ? !!trouvees!.interne : genre === 'filtre' ? !!trouvees!.filtre : !!trouvees!.middleware;
        });
      try {
        unitaires = parMutation(await copie.executer('unitaires', ['aucune', ...actives(MUTATIONS_UNITAIRES)]));
      } catch (erreur) {
        echecUnitaires = erreur;
      }
      fichiersE2e = Object.entries(specsE2e())
        .filter(([, source]) => /x-request-id/i.test(source))
        .map(([fichier]) => fichier);
      try {
        if (fichiersE2e.length > 0) e2e = parMutation(await copie.executer('e2e', ['aucune', ...actives(MUTATIONS_E2E)], fichiersE2e));
      } catch (erreur) {
        echecE2e = erreur;
      }
    } catch (erreur) {
      echec = erreur;
    }
  }, 900_000);
  afterAll(() => copie?.nettoyer());

  const cible = (nom: keyof NonNullable<typeof trouvees>, indice: string) => {
    if (!trouvees?.[nom]) throw new Error(indice);
  };

  describe('8.4 · tes tests de l\'identifiant de requête (e2e)', () => {
    const exiger = () => {
      cible('middleware', 'Aucun fichier de src/ n\'exporte `RequeteIdMiddleware` (exercice 8.4).');
      if (fichiersE2e.length === 0) throw new Error(`Aucun de tes tests e2e ne parle de \`X-Request-Id\`. ${INDICE_E2E}`);
      if (echecE2e) throw echecE2e;
      exigerVert(e2e.aucune, fichiersE2e.join(', '), INDICE_E2E);
    };

    it('ton test vérifie qu\'un identifiant est généré quand le client n\'en fournit pas', () => {
      exiger();
      exigerDetection(e2e, 'middleware:ne-genere-rien', MUTATIONS_E2E['middleware:ne-genere-rien']!);
    });

    it('ton test vérifie que l\'identifiant valide du client est repris', () => {
      exiger();
      exigerDetection(e2e, 'middleware:ignore-le-client', MUTATIONS_E2E['middleware:ignore-le-client']!);
    });

    it('ton test vérifie qu\'un identifiant douteux est remplacé', () => {
      exiger();
      exigerDetection(e2e, 'middleware:accepte-le-douteux', MUTATIONS_E2E['middleware:accepte-le-douteux']!);
    });
  });

  describe('8.10 · ton test unitaire du guard de statut', () => {
    const exiger = () => {
      cible('statut', 'Aucun guard trouvé sur `POST /api/commandes/:id/expedier` (exercice 8.7) : `@UseGuards(TonGuard)` sur la route, le guard exporté par son fichier.');
      if (echecUnitaires) throw echecUnitaires;
      exigerVert(unitaires.aucune, 'src/**/*.spec.ts', INDICE_UNITAIRES);
      exigerMention(specsUnitaires(), new RegExp(`\\b${trouvees!.statut!.export}\\b`), 'src/**/*.spec.ts', `Teste \`${trouvees!.statut!.export}\` sur le modèle de PhaseGuard (exercice 8.10).`);
    };

    for (const mutation of ['statut:refus-ignore', 'statut:message-muet', 'statut:route-libre-refusee', 'statut:id-en-base', 'statut:introuvable-passe']) {
      it(`bug attrapé : ${MUTATIONS_UNITAIRES[mutation]!.split(' (')[0]}`, () => {
        exiger();
        if (mutation === 'statut:route-libre-refusee' && !trouvees!.statut!.cle) throw new Error('Impossible de lire la clé de `@StatutRequis` : écris-le avec `SetMetadata(STATUT_CLE, statut)` (exercice 8.7).');
        exigerDetection(unitaires, mutation, MUTATIONS_UNITAIRES[mutation]!);
      });
    }
  });

  describe('8.11 · ton test unitaire de l\'interceptor du champ interne', () => {
    const exiger = () => {
      cible('interne', 'Aucun interceptor trouvé à la fois sur `GET /api/produits` et `GET /api/produits/:id` (exercice 8.11) : `@UseInterceptors(TonInterceptor)` sur les deux routes (ou sur le contrôleur).');
      if (echecUnitaires) throw echecUnitaires;
      exigerVert(unitaires.aucune, 'src/**/*.spec.ts', INDICE_UNITAIRES);
      exigerMention(specsUnitaires(), new RegExp(`\\b${trouvees!.interne!.export}\\b`), 'src/**/*.spec.ts', `Teste \`${trouvees!.interne!.export}\` avec \`of\` et \`firstValueFrom\` (exercice 8.11).`);
    };

    for (const mutation of ['interne:rien-masque', 'interne:tout-masque', 'interne:origine-modifiee']) {
      it(`bug attrapé : ${MUTATIONS_UNITAIRES[mutation]!.split(' (')[0]}`, () => {
        exiger();
        exigerDetection(unitaires, mutation, MUTATIONS_UNITAIRES[mutation]!);
      });
    }
  });

  describe('8.14 · tes tests de bout en bout du format d\'erreur', () => {
    const exiger = () => {
      cible('filtre', 'Aucun fichier de src/ n\'exporte `ToutesExceptionsFilter` (exercice 8.14).');
      if (fichiersE2e.length === 0) throw new Error(`Aucun de tes tests e2e ne parle de \`X-Request-Id\`. ${INDICE_E2E}`);
      if (echecE2e) throw echecE2e;
      exigerVert(e2e.aucune, fichiersE2e.join(', '), INDICE_E2E);
    };

    it('ton test vérifie le format complet d\'une route inconnue, avec requeteId', () => {
      exiger();
      exigerDetection(e2e, 'filtre:sans-requeteId', MUTATIONS_E2E['filtre:sans-requeteId']!);
    });

    it('ton test vérifie qu\'une validation ratée garde son tableau de messages', () => {
      exiger();
      exigerDetection(e2e, 'filtre:message-aplati', MUTATIONS_E2E['filtre:message-aplati']!);
    });
  });

  describe('8.16 · ton test unitaire du filtre', () => {
    const exiger = () => {
      cible('filtre', 'Aucun fichier de src/ n\'exporte `ToutesExceptionsFilter` (exercice 8.14).');
      if (echecUnitaires) throw echecUnitaires;
      exigerVert(unitaires.aucune, 'src/**/*.spec.ts', INDICE_UNITAIRES);
      exigerMention(specsUnitaires(), /\bToutesExceptionsFilter\b/, 'src/**/*.spec.ts', 'Teste ToutesExceptionsFilter avec un faux ArgumentsHost (exercice 8.16).');
    };

    for (const mutation of ['filtre:secret-revele', 'filtre:500-non-journalisee', 'filtre:4xx-journalisee']) {
      it(`bug attrapé : ${MUTATIONS_UNITAIRES[mutation]!.split(' (')[0]}`, () => {
        exiger();
        exigerDetection(unitaires, mutation, MUTATIONS_UNITAIRES[mutation]!);
      });
    }
  });
});
