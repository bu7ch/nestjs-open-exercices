import { compteConnecte, lancerP9, type AppP9, type CompteConnecte } from './outils.js';

// 9.13 : le détail par champ (`champs`) des erreurs de validation, transmis par ton filtre du 8.14. Les
// autres erreurs gardent exactement le format de la partie 8. À faire toi-même : TES tests.

const CLES_8_14 = ['chemin', 'horodatage', 'message', 'requeteId', 'statusCode'];
const INDICE = 'Ajoute `exceptionFactory: erreursDeValidation` à ton ValidationPipe (dans configurerApp), et fais transmettre `champs` par ToutesExceptionsFilter : `...(champs && { champs })` (exercice 9.13).';

type Champ = { champ?: unknown; erreurs?: unknown };

/** Les entrées de `champs`, vérifiées (un tableau de `{ champ, erreurs: string[] }`). */
function champsDe(corps: { champs?: unknown }): Champ[] {
  if (!Array.isArray(corps?.champs)) throw new Error(`La réponse n'a pas de tableau \`champs\`. ${INDICE} Réponse : ${JSON.stringify(corps).slice(0, 400)}`);
  for (const c of corps.champs as Champ[]) {
    if (typeof c?.champ !== 'string' || !Array.isArray(c.erreurs) || c.erreurs.length === 0 || !c.erreurs.every((e) => typeof e === 'string')) {
      throw new Error(`Chaque entrée de \`champs\` est \`{ champ: string, erreurs: string[] }\` (au moins une erreur). Reçu : ${JSON.stringify(c)}`);
    }
  }
  return corps.champs as Champ[];
}

describe('Partie 9 · Un détail par champ (exercice 9.13)', () => {
  let lancee: AppP9;
  let compte: CompteConnecte;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerP9();
      compte = await compteConnecte(lancee, 'vendeur');
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  const get = (chemin: string) => lancee.http().get(chemin).set('Authorization', compte.bearer).set('X-Request-Id', 'abc-9-13');

  it('deux paramètres invalides : deux entrées dans champs, et le message à plat de la partie 8', async () => {
    const r = await get('/v2/api/produits?limite=500&page=0');
    expect(r.status).toBe(400);
    const champs = champsDe(r.body);
    expect(champs.map((c) => c.champ).sort(), 'une entrée par champ en cause').toEqual(['limite', 'page']);
    expect(Array.isArray(r.body.message), 'le tableau `message` de la partie 8 reste là (rien ne casse chez les clients existants)').toBe(true);
    for (const c of champs) for (const e of c.erreurs as string[]) expect(r.body.message, `l'erreur « ${e} » du champ ${String(c.champ)} est aussi dans \`message\``).toContain(e);
    expect(r.body, 'et le reste du format du 8.14').toMatchObject({ statusCode: 400, requeteId: 'abc-9-13', chemin: '/v2/api/produits?limite=500&page=0' });
  });

  it('un corps invalide : un champ vide et un champ en trop, chacun nommé', async () => {
    const r = await lancee.http().post('/api/vendeurs').set('Authorization', compte.bearer).send({ nom: '', inconnu: 'x' });
    expect(r.status).toBe(400);
    expect(champsDe(r.body).map((c) => c.champ).sort(), 'le même détail pour un corps de requête que pour des paramètres d\'URL').toEqual(['inconnu', 'nom']);
  });

  it('un paramètre inconnu est nommé dans champs', async () => {
    const r = await get('/v2/api/produits?colonne=x');
    expect(r.status, '`forbidNonWhitelisted` : un paramètre qu\'on n\'attendait pas est refusé').toBe(400);
    const champs = champsDe(r.body);
    expect(champs.map((c) => c.champ), 'seul le paramètre inconnu est en cause').toEqual(['colonne']);
    expect(String((champs[0]!.erreurs as string[])[0]), '« property colonne should not exist »').toMatch(/colonne/);
  });

  it('un 404 et un 401 n\'ont pas de champs : exactement le format du 8.14', async () => {
    const introuvable = await get('/api/produits/999999');
    expect(introuvable.status).toBe(404);
    expect(Object.keys(introuvable.body).sort(), '`champs` n\'est ajouté que s\'il existe : `...(champs && { champs })`').toEqual(CLES_8_14);
    const sansJeton = await lancee.http().get('/api/produits');
    expect(sansJeton.status).toBe(401);
    expect(Object.keys(sansJeton.body).sort()).toEqual(CLES_8_14);
  });
});
