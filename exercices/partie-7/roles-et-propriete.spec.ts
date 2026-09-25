import { trouverExport } from '../aide.js';
import { entite, relationVers, sql, type AppAvecBase } from '../partie-5/outils.js';
import { compteConnecte, gardesGlobaux, lancerAvecAuth, messageDe } from './outils.js';

// 7.12 : @Roles() et RolesGuard, GET /api/comptes réservé aux admins ; 7.14 : ne modifier que ses
// propres produits. 7.13 (inverser les guards, exprès) est à faire toi-même : les tests 401/403/200
// ci-dessous échouent si l'ordre est inversé.

const INDICE_RELATION = 'Ajoute à l\'entité Vendeur la relation vers son compte, par exemple `@ManyToOne(\'Compte\') compte: Compte` (exercice 7.14).';

describe('Partie 7 · Les rôles et la propriété (exercices 7.12 à 7.14)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];

  // Si l'application ne démarre pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerAvecAuth();
      http = lancee.http;
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  describe('7.12 · trois rôles, et GET /api/comptes réservé aux admins', () => {
    it('sans jeton : 401 (et pas 403)', async () => {
      const r = await http().get('/api/comptes');
      expect(r.status, 'on ne sait pas qui tu es : 401. Un 403 ici ? RolesGuard passe avant AuthGuard (exercice 7.13)').toBe(401);
    });

    it('un acheteur, ou un vendeur : 403', async () => {
      const acheteur = await compteConnecte(lancee);
      const r = await http().get('/api/comptes').set('Authorization', acheteur.bearer);
      expect(r.status, 'ajoute `GET /api/comptes` avec `@Roles(\'admin\')`, et RolesGuard avec APP_GUARD, après AuthGuard').toBe(403);
      const vendeur = await compteConnecte(lancee, 'vendeur');
      await http().get('/api/comptes').set('Authorization', vendeur.bearer).expect(403);
    });

    it('un admin (passé admin en base, puis reconnecté) : 200, la liste des comptes sans leurs empreintes', async () => {
      const acheteur = await compteConnecte(lancee);
      const admin = await compteConnecte(lancee, 'admin');
      const r = await http().get('/api/comptes').set('Authorization', admin.bearer);
      expect(r.status, 'un admin doit passer : RolesGuard lit le rôle rangé sur la requête par AuthGuard (déclaré AVANT lui)').toBe(200);
      expect(Array.isArray(r.body), 'renvoie la liste des comptes').toBe(true);
      const emails = (r.body as { email: string }[]).map((c) => c.email);
      expect(emails).toEqual(expect.arrayContaining([acheteur.email, admin.email]));
      expect(JSON.stringify(r.body), 'jamais d\'empreinte (motDePasseHache, refreshTokenHache) dans la liste').not.toMatch(/\$argon2|motDePasseHache|refreshTokenHache/);
    });

    it('@Roles() et RolesGuard existent, RolesGuard est déclaré avec APP_GUARD', async () => {
      expect(typeof (await trouverExport('Roles', 'Écris `export const Roles = (...roles: Role[]) => SetMetadata(ROLES_CLE, roles)` (exercice 7.12).'))).toBe('function');
      expect(typeof (await trouverExport('RolesGuard', 'Écris la classe `RolesGuard` (exercice 7.12).'))).toBe('function');
      const gardes = await gardesGlobaux();
      expect(gardes, '`{ provide: APP_GUARD, useClass: RolesGuard }` dans les providers d\'AuthModule, après AuthGuard').toContain('RolesGuard');
    });
  });

  describe('7.14 · ne modifier que ses propres produits', () => {
    let vendeurA: Awaited<ReturnType<typeof compteConnecte>>;
    let vendeurB: Awaited<ReturnType<typeof compteConnecte>>;
    let admin: Awaited<ReturnType<typeof compteConnecte>>;
    let acheteur: Awaited<ReturnType<typeof compteConnecte>>;
    let boutiqueA: number;
    let boutiqueB: number;
    let colonneVendeur: string;
    let tableProduits: string;

    /** Un produit de la boutique de A, créé directement avec tes entités. */
    async function produitDeA(nom = 'Lampe de A'): Promise<number> {
      const produit = entite(lancee.ds, 'Produit', '');
      const versVendeur = relationVers(produit, 'Vendeur', 'many-to-one');
      if (!versVendeur) throw new Error('L\'entité Produit n\'a plus de relation vers Vendeur (exercice 5.9).');
      const cree = (await lancee.ds.getRepository('Produit').save({ nom, prix: 30, categorie: 'mobilier', [versVendeur.propertyName]: { id: boutiqueA } })) as unknown as { id: number };
      return cree.id;
    }

    const lire = async (id: number) => (await sql<{ nom: string; vendeur: number }>(`SELECT nom, "${colonneVendeur}" AS vendeur FROM "${tableProduits}" WHERE id = $1`, [id]))[0];

    // Les comptes et les boutiques du bloc ; une erreur ici est rejouée dans chaque test.
    let echecPreparation: unknown;
    beforeAll(async () => {
      if (echec) return;
      try {
        await preparer();
      } catch (erreur) {
        echecPreparation = erreur;
      }
    });
    beforeEach(() => {
      if (echecPreparation) throw echecPreparation;
    });

    async function preparer() {
      const vendeur = entite(lancee.ds, 'Vendeur', '');
      const versCompte = vendeur.relations.find((r) => r.inverseEntityMetadata.name === 'Compte' && r.joinColumns.length > 0);
      if (!versCompte) return;
      const produit = entite(lancee.ds, 'Produit', '');
      tableProduits = produit.tableName;
      colonneVendeur = relationVers(produit, 'Vendeur', 'many-to-one')?.joinColumns[0]?.databaseName ?? 'vendeurId';
      [vendeurA, vendeurB, admin, acheteur] = [
        await compteConnecte(lancee, 'vendeur'),
        await compteConnecte(lancee, 'vendeur'),
        await compteConnecte(lancee, 'admin'),
        await compteConnecte(lancee),
      ];
      const depot = lancee.ds.getRepository('Vendeur');
      boutiqueA = ((await depot.save({ nom: 'Boutique de A', [versCompte.propertyName]: { id: vendeurA.id } })) as unknown as { id: number }).id;
      boutiqueB = ((await depot.save({ nom: 'Boutique de B', [versCompte.propertyName]: { id: vendeurB.id } })) as unknown as { id: number }).id;
    }

    const exigerRelation = () => {
      const vendeur = entite(lancee.ds, 'Vendeur', '');
      const versCompte = vendeur.relations.find((r) => r.inverseEntityMetadata.name === 'Compte');
      if (!versCompte) throw new Error(`L'entité Vendeur n'a pas de relation vers Compte. ${INDICE_RELATION}`);
      if (versCompte.joinColumns.length === 0) throw new Error(`La relation Vendeur → Compte doit porter la clé étrangère côté vendeurs (\`@ManyToOne\`, ou \`@OneToOne\` avec \`@JoinColumn()\`). ${INDICE_RELATION}`);
    };

    it('le propriétaire renomme son produit (PATCH /api/produits/:id)', async () => {
      exigerRelation();
      const id = await produitDeA();
      const r = await http().patch(`/api/produits/${id}`).set('Authorization', vendeurA.bearer).send({ nom: 'Lampe renommée' });
      expect(r.status, 'ajoute `PATCH /api/produits/:id`, qui renomme le produit si le compte connecté possède son vendeur').toBe(200);
      expect((await lire(id))?.nom, 'le nouveau nom doit être enregistré en base').toBe('Lampe renommée');
    });

    it('un autre vendeur reçoit 403 (`Ce produit ne t\'appartient pas`), et rien ne change', async () => {
      exigerRelation();
      const id = await produitDeA();
      const r = await http().patch(`/api/produits/${id}`).set('Authorization', vendeurB.bearer).send({ nom: 'Volé par B' });
      expect(r.status, 'compare le compte du vendeur du produit avec le compte connecté (`@CompteCourant()`)').toBe(403);
      expect(messageDe(r.body)).toContain('Ce produit ne t\'appartient pas');
      expect((await lire(id))?.nom).toBe('Lampe de A');
    });

    it('un acheteur non plus ne peut pas le modifier (403)', async () => {
      exigerRelation();
      const id = await produitDeA();
      const r = await http().patch(`/api/produits/${id}`).set('Authorization', acheteur.bearer).send({ nom: 'Volé par un acheteur' });
      expect(r.status).toBe(403);
      expect((await lire(id))?.nom).toBe('Lampe de A');
    });

    it('un admin peut renommer le produit d\'un autre', async () => {
      exigerRelation();
      const id = await produitDeA();
      const r = await http().patch(`/api/produits/${id}`).set('Authorization', admin.bearer).send({ nom: 'Renommé par l\'admin' });
      expect(r.status, 'un `admin` passe outre la propriété').toBe(200);
      expect((await lire(id))?.nom).toBe('Renommé par l\'admin');
    });

    it('un produit inconnu : 404 ; sans jeton : 401', async () => {
      exigerRelation();
      const r = await http().patch('/api/produits/999999').set('Authorization', vendeurA.bearer).send({ nom: 'Personne' });
      expect(r.status, 'le produit n\'existe pas : NotFoundException').toBe(404);
      await http().patch('/api/produits/999999').set('Authorization', admin.bearer).send({ nom: 'Personne' }).expect(404);
      const id = await produitDeA();
      await http().patch(`/api/produits/${id}`).send({ nom: 'Anonyme' }).expect(401);
    });

    it('aucun identifiant de propriétaire n\'est accepté dans le corps', async () => {
      exigerRelation();
      const id = await produitDeA();
      const vole = await http().patch(`/api/produits/${id}`).set('Authorization', vendeurB.bearer).send({ nom: 'Volé', vendeurId: boutiqueB, compteId: vendeurB.id });
      expect(vole.status, 'le propriétaire se déduit du jeton, jamais du corps de la requête').toBeGreaterThanOrEqual(400);
      expect(await lire(id)).toMatchObject({ nom: 'Lampe de A', vendeur: boutiqueA });
      const r = await http().patch(`/api/produits/${id}`).set('Authorization', vendeurA.bearer).send({ nom: 'Donné ?', vendeurId: boutiqueB, vendeur: { id: boutiqueB } });
      expect([200, 400], `réponse ${r.status}`).toContain(r.status);
      expect((await lire(id))?.vendeur, 'PATCH ne renomme que le produit : il ne change jamais son vendeur').toBe(boutiqueA);
    });
  });
});
