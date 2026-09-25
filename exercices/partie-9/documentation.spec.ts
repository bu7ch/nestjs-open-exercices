import { lancerAvecBase } from '../partie-5/outils.js';
import { ENV_AUTH } from '../partie-7/outils.js';
import {
  exigerDocument,
  lancerP9,
  nomDeRef,
  proprietes,
  referencesPendantes,
  schemaDe,
  schemaDePage,
  schemaReponse,
  type AppP9,
  type Document,
  type Operation,
  type Schema,
} from './outils.js';

// 9.1 à 9.3 : la documentation Swagger ; 9.8 : `ApiExtraModels` dans `ApiPage` ; 9.14 : les erreurs
// documentées. Les tests lisent le document que renvoie ta `configurerSwagger` (appelée avant `app.init()`).
// À faire toi-même : Authorize et l'essai dans /docs (9.1), le schéma vide sans `@ApiProperty` (9.2),
// TES tests du document et l'appel après `app.init()` (9.3), le message sans `@Type` (9.8), le schéma sans
// `ApiExtraModels` dans /docs-json (9.14). La politique de publication (NODE_ENV, 9.3) est libre.

/** Le schéma de sécurité par jeton (`addBearerAuth()`), s'il existe. */
const schemaBearer = (document: Document) =>
  Object.entries(document.components?.securitySchemes ?? {}).find(([, s]) => s?.type === 'http' && String(s?.scheme).toLowerCase() === 'bearer')?.[0];

/** La sécurité qui s'applique vraiment à une opération (la sienne, sinon celle du document). */
const securite = (document: Document, operation: Operation | undefined) => operation?.security ?? document.security ?? [];

/** Toutes les opérations du document, avec leur chemin et leur méthode. */
const operations = (document: Document) =>
  Object.entries(document.paths ?? {}).flatMap(([chemin, methodes]) =>
    Object.entries(methodes ?? {})
      .filter(([m]) => ['get', 'post', 'put', 'patch', 'delete'].includes(m))
      .map(([methode, operation]) => ({ chemin, methode, operation })),
  );

const operation = (document: Document, chemin: string, methode = 'get'): Operation | undefined => document.paths?.[chemin]?.[methode];

describe('Partie 9 · La documentation (exercices 9.1 à 9.3, 9.8, 9.14)', () => {
  let lancee: AppP9;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerP9();
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  describe('9.1 · publier la documentation', () => {
    it('configurerSwagger : un titre, une description et l\'authentification par jeton', () => {
      const document = exigerDocument(lancee);
      expect(document.info?.title?.trim(), '`.setTitle(\'API Marketplace\')` (le titre de ta documentation)').toBeTruthy();
      expect(document.info?.description?.trim(), '`.setDescription(\'…\')`').toBeTruthy();
      expect(schemaBearer(document), '`.addBearerAuth()` : un schéma de sécurité `http` / `bearer` dans components.securitySchemes').toBeDefined();
    });

    it('le document décrit les routes de la marketplace', () => {
      const chemins = Object.keys(exigerDocument(lancee).paths ?? {});
      for (const attendu of ['/api/produits', '/api/produits/{id}', '/api/vendeurs', '/api/auth/connexion']) {
        expect(chemins, `le chemin ${attendu} manque au document (routes connues : ${chemins.slice(0, 15).join(', ')}…)`).toContain(attendu);
      }
    });

    it('/docs et /docs-json répondent sans jeton', async () => {
      const titre = exigerDocument(lancee).info?.title;
      const interfaceWeb = await lancee.http().get('/docs');
      expect([200, 301], '`SwaggerModule.setup(\'docs\', app, document)` : /docs répond sans jeton (Swagger enregistre ses routes hors de tes contrôleurs)').toContain(interfaceWeb.status);
      const json = await lancee.http().get('/docs-json');
      expect(json.status, '/docs-json : le fichier OpenAPI brut, sans jeton').toBe(200);
      expect(json.body?.info?.title).toBe(titre);
    });
  });

  describe('9.2 · décrire les données du catalogue', () => {
    const INDICE_DTO = 'Crée `ProduitReponseDto` (un `@ApiProperty({ description, example })` par champ) et branche-le avec `@ApiOkResponse({ type: ProduitReponseDto })` (exercice 9.2).';

    const exigerProduitReponse = (document: Document): Schema => {
      const schema = document.components?.schemas?.ProduitReponseDto;
      if (!schema) throw new Error(`Aucun schéma \`ProduitReponseDto\` dans components.schemas. ${INDICE_DTO}`);
      return schema;
    };

    it('ProduitReponseDto : chaque champ a une description et un exemple', () => {
      const document = exigerDocument(lancee);
      const props = proprietes(document, exigerProduitReponse(document));
      const noms = Object.keys(props);
      expect(noms.length, `ProduitReponseDto n'a pas de propriétés (\`"properties": {}\`) : sans \`@ApiProperty\`, Swagger ne voit pas les champs. ${INDICE_DTO}`).toBeGreaterThanOrEqual(3);
      for (const champ of ['id', 'nom', 'prix']) expect(noms, `le champ \`${champ}\` de ProduitReponseDto`).toContain(champ);
      for (const [nom, p] of Object.entries(props)) {
        const cible = p.$ref ? { ...schemaDe(document, p.$ref), ...p } : p;
        expect(cible.description, `ProduitReponseDto.${nom} : ajoute une \`description\``).toBeTruthy();
        if (!p.$ref && !p.items?.$ref) expect(cible.example ?? p.items?.example, `ProduitReponseDto.${nom} : ajoute un \`example\``).toBeDefined();
      }
    });

    it('le détail et la liste du catalogue renvoient des ProduitReponseDto', () => {
      const document = exigerDocument(lancee);
      exigerProduitReponse(document);
      // Une réponse documentée avec son enveloppe `{ data }` (8.13) est acceptée aussi.
      const sansEnveloppe = (schema: Schema | undefined) => (schema && !schema.$ref && proprietes(document, schema).data) || schema;
      const detail = sansEnveloppe(schemaReponse(operation(document, '/api/produits/{id}') ?? operation(document, '/v2/api/produits/{id}'), '200'));
      expect(nomDeRef(detail?.$ref), `GET /api/produits/{id} : \`@ApiOkResponse({ type: ProduitReponseDto })\` (réponse documentée : ${JSON.stringify(detail)})`).toBe('ProduitReponseDto');

      const references = [operation(document, '/api/produits'), operation(document, '/v2/api/produits')].map((o) => {
        const schema = schemaReponse(o, '200');
        return nomDeRef(sansEnveloppe(schema)?.items?.$ref) ?? nomDeRef(schemaDePage(document, schema).donnees?.items?.$ref);
      });
      expect(references, 'GET /api/produits : `@ApiOkResponse({ type: [ProduitReponseDto] })` (ou, en v2, `@ApiPage(ProduitReponseDto)`)').toContain('ProduitReponseDto');
    });

    it('@ApiTags sur tes contrôleurs', () => {
      const sansTag = operations(exigerDocument(lancee))
        .filter(({ chemin, operation }) => /^\/(v\d+\/)?api\//.test(chemin) && !(operation?.tags?.length))
        .map(({ chemin, methode }) => `${methode.toUpperCase()} ${chemin}`);
      expect(sansTag, 'ces routes ne sont rangées dans aucun groupe : `@ApiTags(\'…\')` sur chaque contrôleur').toEqual([]);
    });

    it('@ApiBearerAuth sur les routes protégées, pas sur les routes @Public()', () => {
      const document = exigerDocument(lancee);
      const bearer = schemaBearer(document);
      expect(bearer, '`addBearerAuth()` dans configurerSwagger (exercice 9.1)').toBeDefined();
      const protegee = securite(document, operation(document, '/api/produits/{id}'));
      expect(protegee.some((s) => bearer! in s), 'GET /api/produits/{id} exige un jeton : `@ApiBearerAuth()` sur le contrôleur des produits').toBe(true);
      for (const chemin of ['/api/auth/connexion', '/api/auth/inscription']) {
        const publique = securite(document, operation(document, chemin, 'post'));
        expect(publique.some((s) => bearer! in s), `POST ${chemin} est \`@Public()\` : pas de \`@ApiBearerAuth()\` sur elle (mets-le sur les méthodes protégées de ce contrôleur, pas sur la classe)`).toBe(false);
      }
    });
  });

  describe('9.8 · ApiExtraModels', () => {
    it('la réponse de GET /v2/api/produits est une page : donnees (ProduitReponseDto) et meta', () => {
      const document = exigerDocument(lancee);
      const operationV2 = operation(document, '/v2/api/produits');
      expect(operationV2, 'GET /v2/api/produits n\'est pas dans le document (exercice 9.4)').toBeDefined();
      const props = schemaDePage(document, schemaReponse(operationV2, '200'));
      expect(Object.keys(props), 'documente la page avec `@ApiPage(ProduitReponseDto)` (exercice 9.7)').toEqual(expect.arrayContaining(['donnees', 'meta']));
      expect(nomDeRef(props.donnees?.items?.$ref), '`donnees` : un tableau de `$ref` vers ProduitReponseDto').toBe('ProduitReponseDto');
      const meta = proprietes(document, props.meta);
      expect(Object.keys(meta), `\`meta\` doit pointer vers un schéma qui existe, avec page, limite, total et totalPages (\`ApiExtraModels(MetaPage, modele)\`) ; référence : ${JSON.stringify(props.meta)}`).toEqual(
        expect.arrayContaining(['page', 'limite', 'total', 'totalPages']),
      );
    });

    it('aucune référence $ref ne pointe dans le vide', () => {
      expect(referencesPendantes(exigerDocument(lancee)), 'ces schémas sont référencés (`getSchemaPath`) mais jamais ajoutés au document : il manque `ApiExtraModels(...)` dans ton décorateur').toEqual([]);
    });
  });

  describe('9.14 · documenter les erreurs', () => {
    it('ErreurDto est dans components.schemas, avec le format du 8.14', () => {
      const document = exigerDocument(lancee);
      const schema = document.components?.schemas?.ErreurDto;
      expect(schema, 'écris `ErreurDto` et ajoute-le au document avec `ApiExtraModels(ErreurDto)` dans `ApiErreurs`').toBeDefined();
      expect(Object.keys(proprietes(document, schema))).toEqual(expect.arrayContaining(['statusCode', 'message', 'chemin', 'horodatage']));
    });

    it('au moins trois routes documentent leurs erreurs avec ErreurDto', () => {
      const document = exigerDocument(lancee);
      const documentees = operations(document).filter(({ operation }) =>
        Object.entries(operation?.responses ?? {}).some(([statut, r]) => /^4\d\d$/.test(statut) && nomDeRef(schemaReponse({ responses: { [statut]: r } }, statut)?.$ref) === 'ErreurDto'),
      );
      const noms = documentees.map(({ chemin, methode }) => `${methode.toUpperCase()} ${chemin}`);
      expect(
        noms.length,
        `\`@ApiErreurs(400, 401, 404)\` (les statuts qui peuvent vraiment arriver) sur trois routes : chaque statut pointe vers le schéma ErreurDto (routes trouvées : ${noms.join(', ') || 'aucune'})`,
      ).toBeGreaterThanOrEqual(3);
    });

    it('le détail d\'un produit annonce son 404, avec ErreurDto', () => {
      const document = exigerDocument(lancee);
      const reponses = operations(document).filter(({ operation }) => Object.keys(operation?.responses ?? {}).some((s) => /^4\d\d$/.test(s)));
      if (reponses.length === 0) throw new Error('Aucune route ne documente d\'erreur : `@ApiErreurs(...)` (exercice 9.14).');
      const detail = operation(document, '/api/produits/{id}') ?? operation(document, '/v2/api/produits/{id}');
      const statuts = Object.keys(detail?.responses ?? {}).filter((s) => /^4\d\d$/.test(s));
      // Le cours prend cette route en exemple ; si tu en as choisi trois autres, ce test ne te juge pas.
      if (statuts.length === 0) return;
      expect(statuts, 'GET /api/produits/{id} : le service lève un 404 quand le produit n\'existe pas').toContain('404');
    });
  });
});

// main.ts : la documentation publiée par l'application lancée comme en vrai (9.1), avant `listen`.
describe('Partie 9 · main.ts publie la documentation (exercice 9.1)', () => {
  it('main.ts appelle configurerSwagger avant listen : /docs répond', async () => {
    const lancee = await lancerAvecBase({ via: 'main', env: ENV_AUTH });
    try {
      const r = await lancee.http().get('/docs-json');
      expect(r.status, 'en lançant main.ts, /docs-json répond 404 : appelle `configurerSwagger(app)` dans main.ts, AVANT `app.listen(...)` (hors production si c\'est ta politique, 9.3)').toBe(200);
    } finally {
      await lancee.fermer();
    }
  });
});
