import type { DataSource } from 'typeorm';
import { chargerMigrations, connexionMigrations, differenceAvecEntites, entite, relationVers, sql, verifierBaseJoignable } from '../partie-5/outils.js';
import { fabriquerJeton } from '../partie-7/outils.js';
import { definirStatut } from '../partie-8/outils.js';
import {
  attendre,
  collecter,
  commander,
  connecter,
  creerMonde,
  designe,
  ecouter,
  fermerClients,
  jetonDe,
  lancerP11,
  membres,
  ORIGINE_FRONT,
  ouvrir,
  passerelle,
  suivre,
  synchroniser,
  tableCommandes,
  type AppP11,
  type Client,
  type Monde,
} from './outils.js';

// 11.1 à 11.3 : le gateway, ses salles, ses erreurs et CORS ; 11.4 à 11.6 : le jeton à la connexion,
// chacun ses lignes, l'acheteur prévenu, le rattrapage. De vrais clients socket.io se connectent à ton
// application, qui écoute sur un vrai port.
// À faire toi-même : les interfaces typées (11.1, rien ne se vérifie à l'exécution) ; l'essai sans filtre
// et ce que reçoit le client (11.2) ; retirer la ligne `getType() !== 'http'` puis `cors`, et noter (11.3) ;
// retirer le filtrage des lignes et voir tomber TON test (11.5). Tes propres tests ne sont pas jugés ici.

const sources = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('Partie 11 · Le temps réel (exercices 11.1 à 11.6)', () => {
  let lancee: AppP11;
  let m: Monde;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerP11();
      m = await creerMonde(lancee);
      passerelle(lancee.app);
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterEach(() => {
    if (lancee) fermerClients(lancee.app);
  });
  afterAll(() => lancee?.fermer());

  const produitA = () => ({ id: m.alice.produit, nom: m.alice.nomProduit });
  const produitB = () => ({ id: m.bob.produit, nom: m.bob.nomProduit });
  const INDICE_CREEE = 'Quand `POST /api/commandes` crée une commande, émets `commande:creee` avec `{ commandeId, lignes: [{ produit, quantite }] }` dans la salle `vendeur:<id>` de chaque vendeur concerné (exercice 11.1).';

  describe('11.1 · le vendeur voit arriver ses commandes', () => {
    it('`vendeur:suivre` fait entrer le client dans la salle `vendeur:<id>`, et répond `{ ok: true, donnees: ... }`', async () => {
      const alice = await ouvrir(lancee, jetonDe(m.alice));
      const ack = await suivre(alice, m.alice.boutique);
      expect(ack?.ok, `l'accusé de \`vendeur:suivre\` : \`{ ok: true, donnees: null }\` (11.1). Reçu : ${JSON.stringify(ack)}`).toBe(true);
      expect(ack.donnees === null || Array.isArray(ack.donnees), '`donnees` vaut null (11.1), ou la liste des commandes à rattraper (11.6)').toBe(true);
      expect(membres(passerelle(lancee.app), `vendeur:${m.alice.boutique}`), `le socket doit être dans la salle \`vendeur:${m.alice.boutique}\` : \`await client.join(\\\`vendeur:\${vendeurId}\\\`)\``).toContain(alice.id);
    });

    it('`commande:creee` arrive au client qui suit le vendeur de la commande, et pas à celui qui en suit un autre', async () => {
      const alice = await ouvrir(lancee, jetonDe(m.alice));
      const bob = await ouvrir(lancee, jetonDe(m.bob));
      await suivre(alice, m.alice.boutique);
      await suivre(bob, m.bob.boutique);
      const recusParBob = collecter(bob, 'commande:creee');
      const recu = attendre(alice, 'commande:creee', INDICE_CREEE);

      const commandeId = await commander(lancee, m.carla, [{ varianteId: m.alice.variante, quantite: 2 }]);
      const evenement = await recu;
      expect(evenement?.commandeId, '`commandeId` : l\'identifiant de la commande créée').toBe(commandeId);
      expect(Array.isArray(evenement?.lignes) && evenement.lignes.length, '`lignes` : une entrée par ligne de la commande').toBe(1);
      expect(designe(evenement.lignes[0].produit, produitA()), `\`produit\` désigne le produit de la ligne (son nom, ou son identifiant). Reçu : ${JSON.stringify(evenement.lignes[0])}`).toBe(true);
      expect(evenement.lignes[0].quantite).toBe(2);

      await synchroniser(lancee, bob);
      expect(recusParBob, 'le client qui suit un AUTRE vendeur ne reçoit rien : émets dans la salle du vendeur (`serveur.to(\\`vendeur:${id}\\`).emit(...)`), pas à tout le monde').toEqual([]);
    });
  });

  describe('11.2 · des erreurs qui reviennent au client', () => {
    it('un `vendeurId` qui n\'est pas un entier : `{ ok: false, erreur: ["vendeurId must be an integer number"] }`', async () => {
      const admin = await ouvrir(lancee, jetonDe(m.admin));
      const ack = await suivre(
        admin,
        'abc',
        'Sans `ErreursWsFilter`, une exception (ici, celle du ValidationPipe) n\'appelle jamais l\'accusé : le client attend pour rien. Écris le filtre et applique-le au gateway avec `@UseFilters(ErreursWsFilter)` (11.2) ; valide `vendeurId` avec un DTO (`@IsInt()`).',
      );
      expect(ack, 'un DTO avec `@IsInt() vendeurId`, et un filtre qui répond `{ ok: false, erreur }` avec le message de l\'exception').toEqual({ ok: false, erreur: ['vendeurId must be an integer number'] });
    });

    it('un vendeur inconnu : `{ ok: false, erreur: "Vendeur <id> introuvable" }`', async () => {
      const admin = await ouvrir(lancee, jetonDe(m.admin));
      const ack = await suivre(admin, 99_999, 'Lève `NotFoundException(`Vendeur ${vendeurId} introuvable`)` : ton `ErreursWsFilter` la renvoie dans l\'accusé (11.2).');
      expect(ack).toEqual({ ok: false, erreur: 'Vendeur 99999 introuvable' });
    });
  });

  describe('11.3 · CORS', () => {
    // L'origine de ton front : lue dans ton code (le gateway, configurerApp) ; celle du cours sinon.
    const origines = (): string[] => {
      const trouvees = new Set<string>();
      for (const code of Object.values(sources)) for (const [, url] of code.matchAll(/['"`](https?:\/\/localhost(?::\d+)?)\/?['"`]/g)) trouvees.add(url!);
      trouvees.add(ORIGINE_FRONT);
      return [...trouvees];
    };
    const polling = (origine: string) => fetch(`${lancee.url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: origine } });

    it('`GET /socket.io/?EIO=4&transport=polling` : l\'origine du front reçoit `Access-Control-Allow-Origin`, `http://mechant.example` non', async () => {
      const essais: string[] = [];
      let autorisee = false;
      for (const origine of origines()) {
        const r = await polling(origine);
        await r.text();
        if (r.headers.get('access-control-allow-origin') === origine) autorisee = true;
        else essais.push(`${origine} → ${String(r.headers.get('access-control-allow-origin'))}`);
      }
      if (!autorisee) {
        throw new Error(
          `Aucune origine autorisée par /socket.io (${essais.join(' ; ')}) : \`app.enableCors(...)\` ne concerne que les routes HTTP ; ajoute l'option au gateway : \`@WebSocketGateway({ cors: { origin: ['${ORIGINE_FRONT}'] } })\` (11.3).`,
        );
      }
      const r = await polling('http://mechant.example');
      await r.text();
      expect(r.headers.get('access-control-allow-origin'), 'une origine étrangère n\'est pas autorisée : liste les origines du front, et seulement elles (ni `*`, ni `origin: true`)').toBeNull();
    });
  });

  describe('11.4 · un gateway authentifié', () => {
    it('sans jeton : `connect_error` « Jeton manquant »', async () => {
      await expect(connecter(lancee), 'un middleware `serveur.use(...)` dans `afterInit` refuse la connexion : `suivant(new Error(\'Jeton manquant\'))` (11.4)').rejects.toThrow('Jeton manquant');
    });

    it('avec un jeton falsifié, ou expiré : `connect_error` « Jeton invalide ou expiré »', async () => {
      const contenu = { sub: m.alice.id, email: m.alice.email, role: 'vendeur' };
      const indice = 'vérifie le jeton avec `this.jwt.verifyAsync(jeton)` (le JwtService de la partie 7) ; en cas d\'échec, `suivant(new Error(\'Jeton invalide ou expiré\'))`';
      await expect(connecter(lancee, fabriquerJeton(contenu, {}, 'un-autre-secret-que-celui-de-l-application-!!')), `signé avec un autre secret : ${indice}`).rejects.toThrow('Jeton invalide ou expiré');
      await expect(connecter(lancee, fabriquerJeton(contenu, { expiresIn: -10 })), `expiré : ${indice}`).rejects.toThrow('Jeton invalide ou expiré');
      await expect(connecter(lancee, 'abc.def.ghi'), indice).rejects.toThrow('Jeton invalide ou expiré');
    });

    it('seul le propriétaire du vendeur (ou un admin) entre dans sa salle ; un autre compte est refusé, et ne reçoit rien', async () => {
      const intrus = await ouvrir(lancee, jetonDe(m.bob));
      const admin = await ouvrir(lancee, jetonDe(m.admin));
      const refus = await suivre(intrus, m.alice.boutique);
      expect(refus, 'le propriétaire vient de la base (relation Vendeur → Compte, 7.14), l\'identité du socket (`socket.data`) : `ForbiddenException(\'Ce vendeur ne t\\\'appartient pas\')`').toEqual({ ok: false, erreur: 'Ce vendeur ne t\'appartient pas' });
      expect(membres(passerelle(lancee.app), `vendeur:${m.alice.boutique}`), 'refusé, le socket n\'entre pas dans la salle').not.toContain(intrus.id);
      const ackAdmin = await suivre(admin, m.alice.boutique);
      expect(ackAdmin?.ok, `un \`admin\` suit n'importe quel vendeur. Reçu : ${JSON.stringify(ackAdmin)}`).toBe(true);

      const recusParIntrus = ecouter(intrus);
      const recuParAdmin = attendre(admin, 'commande:creee', INDICE_CREEE);
      const commandeId = await commander(lancee, m.carla, [{ varianteId: m.alice.variante, quantite: 1 }]);
      expect((await recuParAdmin)?.commandeId).toBe(commandeId);
      await synchroniser(lancee, intrus);
      expect(recusParIntrus, 'le compte refusé ne reçoit aucun `commande:creee` de ce vendeur').toEqual([]);
    });
  });

  describe('11.5 · chacun ses lignes, et l\'acheteur prévenu', () => {
    it('une commande à deux vendeurs : chacun ne reçoit que SES lignes', async () => {
      const alice = await ouvrir(lancee, jetonDe(m.alice));
      const bob = await ouvrir(lancee, jetonDe(m.bob));
      await suivre(alice, m.alice.boutique);
      await suivre(bob, m.bob.boutique);
      const pourAlice = attendre(alice, 'commande:creee', INDICE_CREEE);
      const pourBob = attendre(bob, 'commande:creee', INDICE_CREEE);
      const commandeId = await commander(lancee, m.carla, [
        { varianteId: m.alice.variante, quantite: 1 },
        { varianteId: m.bob.variante, quantite: 3 },
      ]);
      const [a, b] = [await pourAlice, await pourBob];
      expect([a?.commandeId, b?.commandeId], 'chaque vendeur reçoit la même commande').toEqual([commandeId, commandeId]);
      const INDICE = 'regroupe les lignes par vendeur, et n\'envoie à chacun que les siennes (jamais celles du concurrent)';
      expect(a.lignes?.length, `Alice : une seule ligne, la sienne ; ${INDICE}. Reçu : ${JSON.stringify(a.lignes)}`).toBe(1);
      expect(designe(a.lignes[0].produit, produitA()) && a.lignes[0].quantite === 1, `Alice reçoit la ligne de son produit (quantité 1). Reçu : ${JSON.stringify(a.lignes)}`).toBe(true);
      expect(b.lignes?.length, `Bob : une seule ligne, la sienne ; ${INDICE}. Reçu : ${JSON.stringify(b.lignes)}`).toBe(1);
      expect(designe(b.lignes[0].produit, produitB()) && b.lignes[0].quantite === 3, `Bob reçoit la ligne de son produit (quantité 3). Reçu : ${JSON.stringify(b.lignes)}`).toBe(true);
    });

    it('`Commande` a un acheteur (relation vers Compte), rempli depuis le jeton par `POST /api/commandes`', async () => {
      const commande = entite(lancee.ds, 'Commande', '');
      const versCompte = relationVers(commande, 'Compte', 'many-to-one');
      expect(versCompte, 'ajoute à Commande `@ManyToOne(\'Compte\', { nullable: true }) acheteur: Compte | null;` (11.5)').toBeDefined();
      const commandeId = await commander(lancee, m.carla, [{ varianteId: m.alice.variante, quantite: 1 }]);
      const colonne = versCompte!.joinColumns[0]!.databaseName;
      const [ligne] = await sql<Record<string, unknown>>(`SELECT "${colonne}" AS acheteur FROM "${tableCommandes(lancee)}" WHERE id = $1`, [commandeId]);
      expect(ligne?.acheteur, 'l\'acheteur est le compte du jeton (`@CompteCourant()`), jamais un compte désigné dans le corps').toBe(m.carla.id);
    });

    it('`POST /api/commandes/:id/expedier` réussi : `commande:statut` à l\'acheteur (salle `compte:<id>`), et à personne d\'autre', async () => {
      const carla = await ouvrir(lancee, jetonDe(m.carla));
      const dan = await ouvrir(lancee, jetonDe(m.dan));
      const p = passerelle(lancee.app);
      expect(membres(p, `compte:${m.carla.id}`), `à la connexion, chaque socket entre dans la salle \`compte:<id>\` de son compte (\`handleConnection\`, 11.5)`).toContain(carla.id);
      const commandeId = await commander(lancee, m.carla, [{ varianteId: m.alice.variante, quantite: 1 }]);
      await definirStatut(lancee, commandeId, 'payee');
      const recusParDan = ecouter(dan);
      const statut = attendre(carla, 'commande:statut', 'Quand `POST /api/commandes/:id/expedier` réussit, émets `commande:statut` avec `{ commandeId, statut }` dans la salle `compte:<id>` de l\'acheteur (11.5).');
      const r = await lancee.http().post(`/api/commandes/${commandeId}/expedier`).set('Authorization', m.admin.bearer);
      expect(r.status, `POST /api/commandes/${commandeId}/expedier (8.7). Réponse : ${JSON.stringify(r.body)}`).toBe(200);
      expect(await statut).toEqual({ commandeId, statut: 'expediee' });
      await synchroniser(lancee, dan);
      expect(recusParDan, 'un autre acheteur ne reçoit rien : émets dans la salle de l\'acheteur de CETTE commande, pas à tous').toEqual([]);
    });
  });

  describe('11.6 · rattraper les commandes manquées', () => {
    /** La commande `id` dans l'accusé de `vendeur:suivre` (`commandeId`, ou `id`). */
    const dansAck = (ack: any, id: number) => (Array.isArray(ack?.donnees) ? ack.donnees.find((c: any) => (c?.commandeId ?? c?.id) === id) : undefined);
    const INDICE_ACK = 'l\'accusé de `vendeur:suivre` renvoie `{ ok: true, donnees: [...] }` : les commandes `en_attente` qui contiennent un produit du vendeur, avec seulement ses lignes (11.6)';

    it('déconnecté (`disconnect()`), puis reconnecté (`connect()`) : la commande manquée est dans l\'accusé, sans les lignes du concurrent', async () => {
      const alice = await ouvrir(lancee, jetonDe(m.alice));
      await suivre(alice, m.alice.boutique);
      alice.disconnect();
      const manquee = await commander(lancee, m.carla, [
        { varianteId: m.alice.variante, quantite: 4 },
        { varianteId: m.bob.variante, quantite: 1 },
      ]);
      const payee = await commander(lancee, m.carla, [{ varianteId: m.alice.variante, quantite: 1 }]);
      await definirStatut(lancee, payee, 'payee');

      alice.connect();
      await new Promise((resoudre) => alice.once('connect', () => resoudre(null)));
      const ack = await suivre(alice, m.alice.boutique);
      const trouvee = dansAck(ack, manquee);
      expect(trouvee, `la commande ${manquee}, passée pendant la déconnexion, doit être dans l'accusé : ${INDICE_ACK}. Reçu : ${JSON.stringify(ack)}`).toBeDefined();
      expect(trouvee.lignes?.length, `seulement les lignes du vendeur (pas celle de Bob). Reçu : ${JSON.stringify(trouvee)}`).toBe(1);
      expect(designe(trouvee.lignes[0].produit, produitA()) && trouvee.lignes[0].quantite === 4, `la ligne d'Alice. Reçu : ${JSON.stringify(trouvee.lignes)}`).toBe(true);
      expect(dansAck(ack, payee), 'seulement les commandes `en_attente` (une commande payée n\'est plus à rattraper)').toBeUndefined();
    });

    it('une vraie coupure (`io.engine.close()`) : après `reconnect`, une commande n\'arrive qu\'une fois `vendeur:suivre` renvoyé', async () => {
      const alice: Client = await ouvrir(lancee, jetonDe(m.alice), { reconnexion: true });
      await suivre(alice, m.alice.boutique);
      const reconnecte = new Promise((resoudre) => alice.io.once('reconnect', resoudre));
      const reconnecteSocket = new Promise<void>((resoudre) => alice.once('connect', () => resoudre()));
      alice.io.engine.close();
      await reconnecte;
      await reconnecteSocket;

      // Nouveau socket, dans aucune salle de vendeur : la commande ne lui arrive pas en direct…
      const enDirect = collecter(alice, 'commande:creee');
      const pendant = await commander(lancee, m.carla, [{ varianteId: m.alice.variante, quantite: 5 }]);
      await synchroniser(lancee, alice);
      expect(enDirect, 'après une reconnexion, le socket est neuf : il ne rejoint la salle du vendeur qu\'en renvoyant `vendeur:suivre` (pas automatiquement à la connexion)').toEqual([]);
      // … mais elle est dans l'accusé du `vendeur:suivre` renvoyé (le rattrapage).
      const ack = await suivre(alice, m.alice.boutique);
      expect(dansAck(ack, pendant), `renvoyer \`vendeur:suivre\` après \`connect\` rattrape la commande ${pendant} : ${INDICE_ACK}`).toBeDefined();

      const suivante = attendre(alice, 'commande:creee', `Après \`vendeur:suivre\` renvoyé, le socket reconnecté est de nouveau dans la salle du vendeur. ${INDICE_CREEE}`);
      const apres = await commander(lancee, m.carla, [{ varianteId: m.alice.variante, quantite: 6 }]);
      expect((await suivante)?.commandeId).toBe(apres);
    });
  });

  // En dernier : ce test vide la base pour y jouer tes migrations.
  describe('11.5 · la migration', () => {
    it('tes migrations ajoutent l\'acheteur à la table des commandes (comme en partie 5)', async () => {
      await verifierBaseJoignable();
      let ds: DataSource | undefined;
      try {
        ds = await connexionMigrations(lancee.ds.entityMetadatas.map((x) => x.target), await chargerMigrations());
        await ds.dropDatabase();
        await ds.runMigrations();
        const table = tableCommandes(lancee);
        const restantes = (await differenceAvecEntites(ds)).filter((q) => q.includes(`"${table}"`));
        expect(restantes, 'après tes migrations, la table des commandes ne correspond pas à l\'entité Commande : génère la migration (`npm run migration:generate -- src/migrations/AjouterAcheteurACommande`)').toEqual([]);
      } finally {
        await ds?.dropDatabase().catch(() => undefined);
        await ds?.destroy();
        await lancee.ds.synchronize();
      }
    });
  });
});
