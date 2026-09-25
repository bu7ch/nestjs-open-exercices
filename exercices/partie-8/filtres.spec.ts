import { BadRequestException, Logger, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { entite, sql, type AppAvecBase } from '../partie-5/outils.js';
import { MOT_DE_PASSE } from '../partie-7/outils.js';
import { cartographier, compteConnecte, creerBoutique, creerCommande, creerProduit, donnees, exportNomme, lancerAvecAuth, nouvelEmail, type CompteConnecte, type Envoi } from './outils.js';

// 8.14 : un format d'erreur unique ; 8.15 : les codes SQL 23505 et 23503 traduits en 409 par le filtre ;
// 8.16 : un 500 ne révèle rien. À faire toi-même : « qu'est-ce qui a changé dans le message » (8.15),
// oublier `vi.restoreAllMocks()` et noter le test qui tombe (8.16). Tes tests e2e du 8.14 et tes tests
// unitaires du 8.16 sont jugés dans tes-tests.spec.ts.

const CLES = ['chemin', 'horodatage', 'message', 'requeteId', 'statusCode'];
const INDICE_FILTRE = 'Écris `@Catch() export class ToutesExceptionsFilter implements ExceptionFilter` (exercice 8.14).';

/** Vérifie qu'une réponse d'erreur a le format unique du 8.14 ; renvoie un message d'erreur, ou null. */
function formatUnique(r: { status: number; body: Record<string, unknown>; headers: Record<string, unknown> }, chemin: string): string | null {
  const cles = Object.keys(r.body ?? {}).sort();
  if (JSON.stringify(cles) !== JSON.stringify(CLES)) return `clés ${JSON.stringify(cles)} au lieu de ${JSON.stringify(CLES)} (corps : ${JSON.stringify(r.body)})`;
  if (r.body.statusCode !== r.status) return `statusCode ${String(r.body.statusCode)} alors que le statut HTTP est ${r.status}`;
  if (r.body.chemin !== chemin) return `chemin ${JSON.stringify(r.body.chemin)} au lieu de ${JSON.stringify(chemin)} (requete.originalUrl)`;
  const date = Date.parse(String(r.body.horodatage));
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(r.body.horodatage)) || Number.isNaN(date) || Math.abs(Date.now() - date) > 60_000) return `horodatage ${JSON.stringify(r.body.horodatage)} : l'heure de l'erreur, avec new Date().toISOString()`;
  if (r.body.requeteId !== r.headers['x-request-id']) return `requeteId ${JSON.stringify(r.body.requeteId)} au lieu de l'identifiant de la requête (${String(r.headers['x-request-id'])}), rangé sur la requête par RequeteIdMiddleware`;
  return null;
}

describe('Partie 8 · Les filtres d\'exceptions (exercices 8.14 à 8.16)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];
  let compte: CompteConnecte;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerAvecAuth();
      http = lancee.http;
      compte = await compteConnecte(lancee, 'vendeur');
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  describe('8.14 · un format d\'erreur unique', () => {
    it('ToutesExceptionsFilter est déclaré avec APP_FILTER', async () => {
      const carte = await cartographier();
      expect(exportNomme(carte, 'ToutesExceptionsFilter'), INDICE_FILTRE).toBeDefined();
      expect(carte.globaux.filtres.map((c) => c.name), 'déclare-le dans un module : `{ provide: APP_FILTER, useClass: ToutesExceptionsFilter }` (pas `app.useGlobalFilters`, absent des tests)').toContain('ToutesExceptionsFilter');
    });

    it('une route inconnue : le format complet, avec l\'identifiant fourni dans X-Request-Id', async () => {
      const r = await http().get('/api/introuvable').set('Authorization', compte.bearer).set('X-Request-Id', 'abc-123');
      expect(r.status).toBe(404);
      expect(Object.keys(r.body).sort(), 'la réponse d\'erreur : `{ statusCode, message, chemin, horodatage, requeteId }`, et rien d\'autre').toEqual(CLES);
      expect(r.body).toMatchObject({ statusCode: 404, chemin: '/api/introuvable', requeteId: 'abc-123' });
      expect(r.body.message, 'le message de l\'exception (`Cannot GET /api/introuvable`)').toEqual(expect.any(String));
      expect(formatUnique(r, '/api/introuvable')).toBeNull();
    });

    it('une validation ratée garde le tableau des règles violées', async () => {
      const r = await http().post('/api/auth/inscription').send({ email: 'pas-un-email', motDePasse: 'x' });
      expect(r.status).toBe(400);
      expect(formatUnique(r, '/api/auth/inscription')).toBeNull();
      expect(Array.isArray(r.body.message), 'le message d\'une validation est un TABLEAU : le filtre le garde tel quel (`corps.message`)').toBe(true);
      expect((r.body.message as string[]).length, 'une règle violée par champ (email, motDePasse)').toBeGreaterThanOrEqual(2);
    });

    it('le même format pour toutes les erreurs : guard (401, 403), pipe (400), 404 d\'un service', async () => {
      const acheteur = await compteConnecte(lancee);
      const essais: [string, string, Envoi][] = [
        ['401 d\'AuthGuard', '/api/produits', () => http().get('/api/produits')],
        ['403 de RolesGuard', '/api/comptes', () => http().get('/api/comptes').set('Authorization', acheteur.bearer)],
        ['400 du ParseIntPipe', '/api/produits/abc', () => http().get('/api/produits/abc').set('Authorization', compte.bearer)],
        ['404 d\'un service', '/api/produits/999999', () => http().get('/api/produits/999999').set('Authorization', compte.bearer)],
      ];
      const problemes: string[] = [];
      for (const [nom, chemin, requete] of essais) {
        const probleme = formatUnique(await requete(), chemin);
        if (probleme) problemes.push(`${nom} : ${probleme}`);
      }
      expect(problemes, 'toutes les erreurs passent par le filtre global, quelle que soit la couche qui les lève (section a)').toEqual([]);
    });
  });

  describe('8.15 · traduire les erreurs de la base', () => {
    it('un email déjà inscrit : 409, au format unique', async () => {
      const email = nouvelEmail('doublon');
      await http().post('/api/auth/inscription').send({ email, motDePasse: MOT_DE_PASSE }).expect(201);
      const r = await http().post('/api/auth/inscription').send({ email, motDePasse: 'UnAutreMotDePasse!' });
      expect(r.status, 'la violation d\'unicité (23505) devient un 409 dans le filtre').toBe(409);
      expect(formatUnique(r, '/api/auth/inscription')).toBeNull();
    });

    it('supprimer un vendeur dont un produit a été commandé : 409, et le vendeur reste', async () => {
      const boutique = await creerBoutique(lancee, compte.id, 'Boutique commandée');
      await creerCommande(lancee, await creerProduit(lancee, boutique), compte.bearer);
      const r = await http().delete(`/api/vendeurs/${boutique}`).set('Authorization', compte.bearer);
      expect(r.status, 'la violation de clé étrangère (23503) devient un 409 dans le filtre').toBe(409);
      expect(formatUnique(r, `/api/vendeurs/${boutique}`)).toBeNull();
      const table = entite(lancee.ds, 'Vendeur', '').tableName;
      expect((await sql(`SELECT id FROM "${table}" WHERE id = $1`, [boutique])).length, 'le vendeur n\'est pas supprimé').toBe(1);
    });

    it('une création réussie n\'est pas touchée par le filtre', async () => {
      const r = await http().post('/api/vendeurs').set('Authorization', compte.bearer).send({ nom: 'Atelier 8.15' });
      expect(r.status).toBe(201);
      expect(donnees(r.body)).toMatchObject({ nom: 'Atelier 8.15' });
    });
  });

  describe('8.16 · un 500 ne révèle rien', () => {
    it('une erreur de la base inattendue (dépassement numérique) : 500, sans le détail SQL', async () => {
      const boutique = await creerBoutique(lancee, compte.id, 'Boutique chère');
      const r = await http().post(`/api/vendeurs/${boutique}/produits`).set('Authorization', compte.bearer).send({ nom: 'Trop cher', prix: 1e15, categorie: 'mobilier' });
      if (r.status < 500) return; // ta validation refuse déjà ce prix (400) : rien à vérifier ici, le test suivant le fait.
      expect(r.status).toBe(500);
      expect(formatUnique(r, `/api/vendeurs/${boutique}/produits`)).toBeNull();
      expect(JSON.stringify(r.body.message), 'le message d\'un 500 est générique : jamais le texte de l\'erreur SQL').not.toMatch(/overflow|numeric|INSERT|QueryFailed|"produits"/i);
    });
  });
});

// Sans application : le filtre est appelé directement, avec un faux ArgumentsHost (comme dans le cours).
describe('Partie 8 · ToutesExceptionsFilter, appelé directement (exercices 8.15, 8.16)', () => {
  type Filtre = { catch(exception: unknown, hote: ArgumentsHost): unknown };
  let Classe: new () => Filtre;

  beforeAll(async () => {
    Classe = exportNomme(await cartographier(), 'ToutesExceptionsFilter')?.valeur as new () => Filtre;
  });

  /** Appelle le filtre ; renvoie le statut et le corps envoyés (les journaux du filtre sont coupés). */
  function appeler(exception: unknown): { statut?: number; corps?: Record<string, unknown> } {
    if (typeof Classe !== 'function') throw new Error(`Aucun fichier de src/ n'exporte \`ToutesExceptionsFilter\`. ${INDICE_FILTRE}`);
    const envoye: { statut?: number; corps?: Record<string, unknown> } = {};
    const reponse = {
      status(code: number) {
        envoye.statut = code;
        return reponse;
      },
      json(corps: Record<string, unknown>) {
        envoye.corps = corps;
        return reponse;
      },
    };
    const requete = { method: 'POST', originalUrl: '/api/vendeurs', url: '/api/vendeurs', requeteId: 'abc-123', headers: {} };
    const http = { getRequest: () => requete, getResponse: () => reponse, getNext: () => () => undefined };
    const hote = { switchToHttp: () => http, getType: () => 'http', getArgs: () => [requete, reponse], getArgByIndex: (i: number) => [requete, reponse][i] } as unknown as ArgumentsHost;
    const silence = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      new Classe().catch(exception, hote);
    } finally {
      silence.mockRestore();
    }
    if (envoye.statut === undefined) throw new Error('Le filtre n\'a pas répondu avec `reponse.status(statut).json({ ... })` (la réponse de `hote.switchToHttp().getResponse()`).');
    return envoye;
  }

  const erreurSql = (code: string, detail = 'détail SQL') => new QueryFailedError('INSERT INTO "comptes" …', [], Object.assign(new Error(detail), { code }));

  it('8.15 · les codes SQL 23505 (unicité) et 23503 (clé étrangère) deviennent un 409', () => {
    for (const code of ['23505', '23503']) {
      const { statut, corps } = appeler(erreurSql(code));
      expect(statut, `QueryFailedError de code ${code} : \`exception.driverError.code\``).toBe(409);
      expect(corps?.statusCode).toBe(409);
      expect(JSON.stringify(corps), 'le message du 409 est le tien, pas le détail SQL').not.toContain('détail SQL');
    }
  });

  it('8.15 · une autre erreur SQL reste un 500', () => {
    expect(appeler(erreurSql('22P02')).statut, 'seuls 23505 et 23503 deviennent un 409').toBe(500);
  });

  it('8.16 · une erreur inattendue : 500, message générique, sans le secret ni la pile', () => {
    const { statut, corps } = appeler(new Error('mot de passe de la base : hunter2'));
    expect(statut).toBe(500);
    expect(corps?.statusCode).toBe(500);
    expect(typeof corps?.message, 'un message générique (« Erreur interne du serveur »)').toBe('string');
    expect(JSON.stringify(corps), 'le message de l\'erreur (et sa pile) restent dans le journal, jamais dans la réponse').not.toMatch(/hunter2|at .*\.ts/);
  });

  it('8.14 · une HttpException garde son statut, son message (même un tableau) et le format unique', () => {
    const introuvable = appeler(new NotFoundException('Vendeur 9 introuvable'));
    expect(introuvable.statut).toBe(404);
    expect(introuvable.corps).toMatchObject({ statusCode: 404, message: 'Vendeur 9 introuvable', chemin: '/api/vendeurs', requeteId: 'abc-123' });
    expect(Object.keys(introuvable.corps ?? {}).sort()).toEqual(CLES);
    const validation = appeler(new BadRequestException(['nom should not be empty', 'nom must be a string']));
    expect(validation.corps?.message).toEqual(['nom should not be empty', 'nom must be a string']);
  });
});
