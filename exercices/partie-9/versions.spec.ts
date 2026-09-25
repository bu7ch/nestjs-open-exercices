import { boutique, compteConnecte, creerProduit, donnees, exigerDocument, lancerP9, type AppP9, type CompteConnecte } from './outils.js';

// 9.4 à 9.6 : les versions dans l'URL. `/api/produits` (sans numéro) reste l'ancienne version, `/v2/api/produits`
// la nouvelle ; `/v1/...` n'existe pas. Le versionnement s'active dans ton `configurerApp` (partie 6),
// que les tests appellent comme main.ts. À faire toi-même : TES tests des deux versions, la vérification
// dans /docs que la v1 est barrée (9.5), le commentaire du 9.6.

const INDICE_VERSIONS = 'Active le versionnement dans configurerApp : `app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL })`, puis ajoute une méthode `@Version(\'2\') @Get()` au contrôleur des produits (exercice 9.4).';

describe('Partie 9 · Versionner l\'API (exercices 9.4 à 9.6)', () => {
  let lancee: AppP9;
  let compte: CompteConnecte;
  let produit: number;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerP9();
      compte = await compteConnecte(lancee);
      produit = await creerProduit(lancee, await boutique(lancee), { nom: 'Lampe versionnée' });
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  const get = (chemin: string) => lancee.http().get(chemin).set('Authorization', compte.bearer);

  describe('9.4 · une v2 pour le catalogue', () => {
    it('GET /api/produits (sans numéro) répond toujours, avec un tableau', async () => {
      const r = await get('/api/produits');
      expect(r.status, 'l\'adresse d\'origine doit continuer de répondre : `defaultVersion: VERSION_NEUTRAL` (avec `\'1\'`, elle passerait sous /v1 et tous les clients casseraient)').toBe(200);
      expect(Array.isArray(donnees(r.body)), 'la v1 renvoie toujours un TABLEAU de produits (enveloppé dans { data } depuis le 8.13)').toBe(true);
    });

    it('GET /v2/api/produits répond', async () => {
      const r = await get('/v2/api/produits');
      expect(r.status, INDICE_VERSIONS).toBe(200);
    });

    it('GET /v1/api/produits : 404 (la version 1 n\'a jamais eu de préfixe)', async () => {
      await get('/v1/api/produits').expect(404);
    });

    it('les autres routes restent à leur adresse', async () => {
      const r = await get('/api/vendeurs');
      expect(r.status, 'une route sans @Version est neutre : GET /api/vendeurs répond comme avant').toBe(200);
    });
  });

  describe('9.5 · annoncer la fin de l\'ancienne version', () => {
    it('la v1 envoie Deprecation et Sunset (une date HTTP)', async () => {
      const r = await get('/api/produits');
      expect(r.headers.deprecation, '`@Header(\'Deprecation\', \'true\')` sur la méthode de la v1').toBeTruthy();
      const sunset = String(r.headers.sunset ?? '');
      expect(sunset, '`@Header(\'Sunset\', \'Thu, 30 Sep 2027 23:59:59 GMT\')` : la date où la v1 pourra disparaître').not.toBe('');
      const date = Date.parse(sunset);
      expect(Number.isNaN(date), `Sunset « ${sunset} » n'est pas une date HTTP (format \`new Date(...).toUTCString()\`)`).toBe(false);
      expect(new Date(date).getUTCFullYear(), 'une date à venir (dans un an)').toBeGreaterThanOrEqual(2026);
    });

    it('la v2 n\'en envoie aucun', async () => {
      const r = await get('/v2/api/produits');
      expect(r.status).toBe(200);
      expect([r.headers.deprecation, r.headers.sunset], 'les en-têtes vont sur la méthode de la v1 seulement, pas sur le contrôleur').toEqual([undefined, undefined]);
    });

    it('dans la documentation : les deux chemins, la v1 marquée deprecated', () => {
      const document = exigerDocument(lancee);
      expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/api/produits', '/v2/api/produits']));
      expect(document.paths['/api/produits']?.get?.deprecated, '`@ApiOperation({ summary: \'…\', deprecated: true })` sur la v1').toBe(true);
      expect(document.paths['/v2/api/produits']?.get?.deprecated ?? false, 'la v2 n\'est pas obsolète').toBe(false);
    });
  });

  describe('9.6 · les routes inchangées', () => {
    it('le détail répond sans numéro ET en v2', async () => {
      const sans = await get(`/api/produits/${produit}`);
      expect(sans.status, 'GET /api/produits/:id répond toujours à son adresse d\'origine').toBe(200);
      expect(donnees(sans.body)?.id).toBe(produit);
      const v2 = await get(`/v2/api/produits/${produit}`);
      expect(v2.status, 'une route neutre ne répond pas sous /v2 : `@Version([VERSION_NEUTRAL, \'2\'])` sur le détail').toBe(200);
      expect(donnees(v2.body)?.id).toBe(produit);
    });

    it('/v1/api/produits/:id reste un 404', async () => {
      await get(`/v1/api/produits/${produit}`).expect(404);
    });
  });
});
