import { chargerMigrations, connexionMigrations, differenceAvecEntites, entite, sql, verifierBaseJoignable, type AppAvecBase } from '../partie-5/outils.js';
import { messageDe } from '../partie-7/outils.js';
import { DataSource } from 'typeorm';
import { cartographier, compteConnecte, creerBoutique, creerCommande, creerProduit, definirStatut, donnees, exportNomme, lancerAvecAuth, trouverRoute, type CompteConnecte } from './outils.js';

// 8.7 : le statut d'une commande et son guard ; 8.8 : chaque vendeur ne voit que ses commandes ;
// 8.9 : le guard vérifie lui-même que l'identifiant est un entier (casser exprès, puis réparer : fais-le
// toi-même ; ici, on vérifie que c'est réparé). Tes tests du 8.10 sont jugés dans tes-tests.spec.ts.

const INDICE_COMMANDE = 'Ajoute à l\'entité Commande `@Column({ type: \'varchar\', default: \'en_attente\' }) statut` (exercice 8.7).';

describe('Partie 8 · Les guards (exercices 8.7 à 8.9)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];
  let admin: CompteConnecte;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerAvecAuth();
      http = lancee.http;
      admin = await compteConnecte(lancee, 'admin');
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  /** Une commande neuve (d'un produit d'une boutique neuve). */
  async function nouvelleCommande(): Promise<number> {
    const vendeur = await compteConnecte(lancee, 'vendeur');
    const boutique = await creerBoutique(lancee, vendeur.id);
    return creerCommande(lancee, await creerProduit(lancee, boutique), admin.bearer);
  }

  const expedier = (id: number | string, bearer = admin.bearer) => http().post(`/api/commandes/${id}/expedier`).set('Authorization', bearer);

  describe('8.7 · un guard de statut', () => {
    it('Commande a une colonne `statut`, `en_attente` par défaut', async () => {
      const colonne = entite(lancee.ds, 'Commande', INDICE_COMMANDE).findColumnWithPropertyName('statut');
      expect(colonne, INDICE_COMMANDE).toBeDefined();
      expect(colonne!.default, '`default: \'en_attente\'`').toBe('en_attente');
      const id = await nouvelleCommande();
      const [ligne] = await sql<{ statut: string }>(`SELECT statut FROM "${entite(lancee.ds, 'Commande', '').tableName}" WHERE id = $1`, [id]);
      expect(ligne?.statut, 'une commande créée par POST /api/commandes est `en_attente`').toBe('en_attente');
    });

    it('le décorateur @StatutRequis existe', async () => {
      const carte = await cartographier();
      expect(typeof exportNomme(carte, 'StatutRequis')?.valeur, 'écris `export const StatutRequis = (statut) => SetMetadata(STATUT_CLE, statut)` (exercice 8.7)').toBe('function');
      const route = trouverRoute(carte, 'POST', 'api/commandes/:id/expedier');
      expect(route, 'ajoute `POST /api/commandes/:id/expedier` (dans le contrôleur des commandes)').toBeDefined();
      expect(route!.gardes.length, 'protège la route avec ton guard : `@UseGuards(...)`').toBeGreaterThan(0);
    });

    it('une commande en_attente : 403, avec le statut actuel dans le message', async () => {
      const id = await nouvelleCommande();
      const r = await expedier(id);
      expect(r.status, 'POST /api/commandes/:id/expedier, avec `@StatutRequis(\'payee\')` et ton guard : une commande en_attente est refusée').toBe(403);
      expect(messageDe(r.body), 'le message de refus dit le statut actuel de la commande').toContain('en_attente');
    });

    it('une commande payee passe', async () => {
      const id = await nouvelleCommande();
      await definirStatut(lancee, id, 'payee');
      const r = await expedier(id);
      expect([200, 201, 204], `une commande payee doit pouvoir être expédiée (réponse ${r.status} : ${JSON.stringify(r.body)})`).toContain(r.status);
    });

    it('le refus dépend bien du statut : une commande expediee ou annulee est refusée aussi', async () => {
      for (const statut of ['expediee', 'annulee']) {
        const id = await nouvelleCommande();
        await definirStatut(lancee, id, statut);
        const r = await expedier(id);
        expect(r.status, `une commande ${statut} n'est pas payee`).toBe(403);
        expect(messageDe(r.body)).toContain(statut);
      }
    });

    it('une commande inconnue : 404 ; sans jeton : 401', async () => {
      const r = await expedier(999_999);
      expect(r.status, 'le guard charge la commande de la route : introuvable, NotFoundException').toBe(404);
      await http().post('/api/commandes/1/expedier').expect(401);
    });

    it('8.9 · un identifiant absurde (`abc`) : 400, pas 500', async () => {
      const r = await expedier('abc');
      expect(r.status, 'le guard passe AVANT le ParseIntPipe de la méthode : il doit vérifier lui-même que `:id` est un entier (`Number.isInteger`), sinon NaN part en base (500)').toBe(400);
    });
  });

  describe('8.8 · chaque vendeur ne voit que ses commandes', () => {
    let alice: CompteConnecte;
    let bob: CompteConnecte;
    let acheteur: CompteConnecte;
    let boutiqueAlice: number;
    let boutiqueBob: number;
    let commandeAlice: number;
    let commandeBob: number;

    let echecPreparation: unknown;
    beforeAll(async () => {
      if (echec) return;
      try {
        [alice, bob, acheteur] = [await compteConnecte(lancee, 'vendeur'), await compteConnecte(lancee, 'vendeur'), await compteConnecte(lancee)];
        boutiqueAlice = await creerBoutique(lancee, alice.id, 'Chez Alice');
        boutiqueBob = await creerBoutique(lancee, bob.id, 'Chez Bob');
        commandeAlice = await creerCommande(lancee, await creerProduit(lancee, boutiqueAlice), acheteur.bearer);
        commandeBob = await creerCommande(lancee, await creerProduit(lancee, boutiqueBob), acheteur.bearer);
      } catch (erreur) {
        echecPreparation = erreur;
      }
    });
    beforeEach(() => {
      if (echecPreparation) throw echecPreparation;
    });

    const commandesDe = (boutique: number | string, bearer?: string) => {
      const requete = http().get(`/api/vendeurs/${boutique}/commandes`);
      return bearer ? requete.set('Authorization', bearer) : requete;
    };
    const ids = (corps: unknown): number[] => {
      const liste = donnees<unknown>(corps);
      if (!Array.isArray(liste)) throw new Error(`GET /api/vendeurs/:vendeurId/commandes doit renvoyer la liste des commandes (un tableau). Réponse : ${JSON.stringify(corps)}`);
      return liste.map((c: { id?: unknown }) => Number(c?.id));
    };

    it('le propriétaire voit ses commandes, et seulement les siennes', async () => {
      const r = await commandesDe(boutiqueAlice, alice.bearer);
      expect(r.status, 'ajoute `GET /api/vendeurs/:vendeurId/commandes` : les commandes qui contiennent un produit de ce vendeur').toBe(200);
      expect(ids(r.body), 'la commande d\'un produit de sa boutique').toContain(commandeAlice);
      expect(ids(r.body), 'jamais la commande d\'un autre vendeur').not.toContain(commandeBob);
    });

    it('un autre vendeur : 403, sans aucune commande dans la réponse', async () => {
      const r = await commandesDe(boutiqueAlice, bob.bearer);
      expect(r.status, 'ton guard compare le compte du vendeur de la route (relation Vendeur → Compte, 7.14) au compte connecté').toBe(403);
      expect(JSON.stringify(r.body)).not.toContain('"lignes"');
    });

    it('un acheteur : 403', async () => {
      await commandesDe(boutiqueAlice, acheteur.bearer).expect(403);
    });

    it('un admin voit les commandes de n\'importe quel vendeur', async () => {
      const r = await commandesDe(boutiqueBob, admin.bearer);
      expect(r.status, 'un `admin` passe outre la propriété').toBe(200);
      expect(ids(r.body)).toContain(commandeBob);
      expect(ids(r.body)).not.toContain(commandeAlice);
    });

    it('un vendeur inconnu : 404 (pour un vendeur comme pour un admin) ; sans jeton : 401', async () => {
      const r = await commandesDe(999_999, alice.bearer);
      expect(r.status, 'le guard charge le vendeur de la route : introuvable, NotFoundException').toBe(404);
      await commandesDe(999_999, admin.bearer).expect(404);
      await commandesDe(boutiqueAlice).expect(401);
    });

    it('8.9 · un identifiant absurde (`abc`) : 400, pas 500', async () => {
      const r = await commandesDe('abc', alice.bearer);
      expect(r.status, 'ton guard lit `:vendeurId` avant le ParseIntPipe : vérifie que c\'est un entier').toBe(400);
    });
  });

  // En dernier : ce test vide la base pour y jouer tes migrations.
  describe('8.7 · la migration', () => {
    it('tes migrations ajoutent la colonne statut (comme en partie 5)', async () => {
      entite(lancee.ds, 'Commande', INDICE_COMMANDE);
      await verifierBaseJoignable();
      let ds: DataSource | undefined;
      try {
        ds = await connexionMigrations(lancee.ds.entityMetadatas.map((m) => m.target), await chargerMigrations());
        await ds.dropDatabase();
        await ds.runMigrations();
        const restantes = (await differenceAvecEntites(ds)).filter((q) => /"commandes"/.test(q));
        expect(restantes, 'après tes migrations, la table commandes ne correspond pas à l\'entité Commande : génère la migration (`npm run migration:generate -- src/migrations/AjouterStatutACommande`), comme en partie 5').toEqual([]);
      } finally {
        await ds?.dropDatabase().catch(() => undefined);
        await ds?.destroy();
        await lancee.ds.synchronize();
      }
    });
  });
});
