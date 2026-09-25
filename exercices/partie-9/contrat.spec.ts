import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseEnv } from 'node:util';
import { exigerDetection, exigerVert, parMutation, preparerCopie, specsE2e, type Copie, type Execution } from '../partie-6/outils.js';
import { cartographier, exportNomme } from '../partie-8/outils.js';
import { SECRET, SECRET_REFRESH } from '../partie-7/outils.js';

// 9.15 : le contrat figé. Ton test `toMatchFileSnapshot` est jugé comme en parties 6 et 8 : ton projet est
// copié dans un dossier temporaire, ton test y tourne (il doit passer, avec le fichier de référence que tu
// as commité), puis il est relancé avec un champ de `ProduitReponseDto` renommé dans la documentation :
// il doit tomber. À faire toi-même : le renommage, `-u`, la lecture du diff et ta phrase sur le changement
// cassant.

const INDICE = 'Écris dans test/ (`*.e2e-spec.ts`) le test du cours : `await expect(JSON.stringify(document, null, 2)).toMatchFileSnapshot(\'./openapi.snapshot.json\')`, lance-le une fois et commite le fichier créé (exercice 9.15).';
const MUTATION = 'contrat:champ-renomme';
const DESCRIPTION = 'un champ de ProduitReponseDto est renommé dans la documentation, sans que le fichier de référence change (ton test doit comparer TOUT le document au fichier)';

const racine = new URL('../..', import.meta.url).pathname;

/** Les variables que tes tests trouvent d'habitude dans ton .env.test : on ne fournit que celles qui y manquent. */
function variablesManquantes(): Record<string, string> {
  const fichier = join(racine, '.env.test');
  const tiennes = existsSync(fichier) ? parseEnv(readFileSync(fichier, 'utf8')) : {};
  const nos = { NOMBRE_MAX_PRODUITS: '1000', JWT_SECRET: SECRET, JWT_REFRESH_SECRET: SECRET_REFRESH, THROTTLE_ACTIF: 'false' };
  return Object.fromEntries(Object.entries(nos).filter(([cle]) => tiennes[cle] === undefined));
}

describe('Partie 9 · Figer le contrat (exercice 9.15)', () => {
  let copie: Copie | undefined;
  let fichiers: string[] = [];
  let executions: Record<string, Execution> = {};

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      // Tes fichiers e2e qui figent le document dans un fichier de référence.
      const specs = Object.entries(specsE2e()).filter(([, source]) => /toMatchFileSnapshot\s*\(/.test(source));
      if (specs.length === 0) throw new Error(`Aucun de tes tests e2e n'appelle \`toMatchFileSnapshot\`. ${INDICE}`);
      for (const [fichier, source] of specs) {
        for (const [, chemin] of source.matchAll(/toMatchFileSnapshot\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
          const reference = join(racine, dirname(fichier), chemin!);
          if (!existsSync(reference)) {
            throw new Error(`Le fichier de référence ${relative(racine, reference)} (celui de \`toMatchFileSnapshot\` dans ${fichier}) n'existe pas : lance ton test une fois pour le créer, et commite-le.`);
          }
        }
      }
      fichiers = specs.map(([fichier]) => fichier);

      const dto = exportNomme(await cartographier(), 'ProduitReponseDto');
      if (!dto) throw new Error('Aucun fichier de src/ n\'exporte `ProduitReponseDto` (exercice 9.2) : c\'est lui que ce test modifie.');

      // CI=true : un fichier de référence absent fait échouer le test au lieu d'être créé en silence.
      copie = preparerCopie({}, { mutations: 'exercices/partie-9/mutations.ts', plan: { cible9: { fichier: dto.fichier, export: dto.nom } }, env: { ...variablesManquantes(), CI: 'true' } });
      executions = parMutation(await copie.executer('e2e', ['aucune', MUTATION], fichiers));
    } catch (erreur) {
      echec = erreur;
    }
  }, 600_000);
  afterAll(() => copie?.nettoyer());

  it('ton test du contrat passe sur ton code, avec le fichier de référence commité', () => {
    exigerVert(executions.aucune, fichiers.join(', '), `Si le document a changé exprès, relance tes tests e2e avec \`-u\` et commite le fichier. ${INDICE}`);
  });

  it('il tombe quand un champ d\'un DTO de réponse est renommé', () => {
    exigerVert(executions.aucune, fichiers.join(', '), INDICE);
    exigerDetection(executions, MUTATION, DESCRIPTION);
  });
});
