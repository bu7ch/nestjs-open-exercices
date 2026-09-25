import type { AppAvecBase } from '../partie-5/outils.js';
import { compteConnecte, donnees, lancerAvecAuth, type Envoi } from './outils.js';

// 8.4 : l'identifiant de requête (X-Request-Id) ; 8.6 : la route /sante, exclue du middleware, et
// l'en-tête X-Serveur. 8.5 (le journal, et la vingtaine de lancements sans vi.waitFor) est à faire
// toi-même : le journal arrive parfois APRÈS la réponse, un test ici serait aussi fragile que le tien.
// Tes propres tests du 8.4 sont jugés dans tes-tests.spec.ts.

const FORMAT_SUR = /^[\w-]{1,64}$/;

describe('Partie 8 · Les middlewares (exercices 8.4 et 8.6)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];
  let bearer: string;

  // Si l'application ne démarre pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerAvecAuth();
      http = lancee.http;
      ({ bearer } = await compteConnecte(lancee));
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  describe('8.4 · un identifiant pour chaque requête', () => {
    it('sans identifiant du client, la réponse en porte un nouveau (X-Request-Id), différent à chaque requête', async () => {
      const [a, b] = [await http().get('/api/produits').set('Authorization', bearer), await http().get('/api/produits').set('Authorization', bearer)];
      const id = a.headers['x-request-id'];
      expect(id, 'écris RequeteIdMiddleware : il pose l\'en-tête `X-Request-Id` sur la réponse, et branche-le sur toutes les routes (`forRoutes(\'*\')`)').toBeTypeOf('string');
      expect(id, 'un identifiant généré avec `randomUUID()` (lettres, chiffres, tirets)').toMatch(FORMAT_SUR);
      expect(b.headers['x-request-id'], 'un nouvel identifiant pour chaque requête').not.toBe(id);
    });

    it('reprend l\'identifiant fourni par le client s\'il est valide', async () => {
      const r = await http().get('/api/produits').set('Authorization', bearer).set('X-Request-Id', 'front-42');
      expect(r.headers['x-request-id'], 'un identifiant sûr fourni par le client (`X-Request-Id: front-42`) est repris tel quel').toBe('front-42');
    });

    it('remplace un identifiant douteux par un nouveau', async () => {
      for (const douteux of ['../../etc/passwd', '<script>alert(1)</script>', 'a b c']) {
        const r = await http().get('/api/produits').set('Authorization', bearer).set('X-Request-Id', douteux);
        const id = r.headers['x-request-id'];
        expect(id, `X-Request-Id: ${douteux} : jamais repris tel quel (vérifie-le avec une expression régulière, comme /^[\\w-]{1,64}$/)`).not.toBe(douteux);
        expect(id, `X-Request-Id: ${douteux} : un nouvel identifiant est généré à la place`).toMatch(FORMAT_SUR);
      }
    });

    it('s\'applique à toutes les routes : même refusée (401), inconnue (404) ou publique', async () => {
      const essais: [string, Envoi][] = [
        ['GET /api/produits sans jeton (401)', () => http().get('/api/produits')],
        ['GET /api/route-inconnue (404)', () => http().get('/api/route-inconnue').set('Authorization', bearer)],
        ['POST /api/auth/connexion (publique)', () => http().post('/api/auth/connexion').send({ email: 'fantome@exemple.fr', motDePasse: 'PasLeBon' })],
        ['GET /api/categories', () => http().get('/api/categories').set('Authorization', bearer)],
      ];
      const sansId: string[] = [];
      for (const [nom, requete] of essais) if (typeof (await requete()).headers['x-request-id'] !== 'string') sansId.push(nom);
      expect(sansId, 'ces réponses n\'ont pas d\'en-tête X-Request-Id : le middleware tourne avant les guards et avant la recherche de la route, branche-le avec `forRoutes(\'*\')`').toEqual([]);
    });

    it('l\'identifiant est rangé sur la requête : on le retrouve dans la réponse d\'erreur (8.14)', async () => {
      const r = await http().get('/api/route-inconnue').set('Authorization', bearer).set('X-Request-Id', 'trace-8-4');
      expect(r.body?.requeteId, '`requete.requeteId = id` dans le middleware, que ToutesExceptionsFilter recopie dans `requeteId` (exercice 8.14)').toBe('trace-8-4');
    });
  });

  describe('8.6 · une route exclue, et un middleware fonctionnel', () => {
    it('GET /sante répond { statut: "ok" }, sans jeton', async () => {
      const r = await http().get('/sante');
      expect(r.status, 'ajoute `GET /sante`, marquée `@Public()` (le guard global de la partie 7 exige sinon un jeton)').toBe(200);
      expect(donnees(r.body), 'la réponse de /sante (enveloppée dans { data } après le 8.13)').toEqual({ statut: 'ok' });
    });

    it('GET /sante n\'a pas d\'en-tête X-Request-Id, les autres routes si', async () => {
      const r = await http().get('/sante');
      expect(r.headers['x-request-id'], 'exclus /sante du middleware : `.exclude({ path: \'sante\', method: RequestMethod.GET })`').toBeUndefined();
      const autre = await http().get('/api/produits').set('Authorization', bearer);
      expect(autre.headers['x-request-id'], 'l\'exclusion ne doit retirer QUE /sante').toBeTypeOf('string');
    });

    it('X-Serveur: marketplace sur toutes les réponses, /sante comprise', async () => {
      const essais: [string, Envoi][] = [
        ['GET /sante', () => http().get('/sante')],
        ['GET /api/produits', () => http().get('/api/produits').set('Authorization', bearer)],
        ['GET /api/produits sans jeton (401)', () => http().get('/api/produits')],
        ['GET /api/route-inconnue (404)', () => http().get('/api/route-inconnue').set('Authorization', bearer)],
      ];
      const sans: string[] = [];
      for (const [nom, requete] of essais) if ((await requete()).headers['x-serveur'] !== 'marketplace') sans.push(nom);
      expect(sans, 'ces réponses n\'ont pas l\'en-tête `X-Serveur: marketplace` : un middleware fonctionnel `(requete, reponse, suivant) => { reponse.setHeader(\'X-Serveur\', \'marketplace\'); suivant(); }`, branché sur toutes les routes (sans l\'exclusion de /sante)').toEqual([]);
    });
  });
});
