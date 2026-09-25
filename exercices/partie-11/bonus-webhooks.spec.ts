import Stripe from 'stripe';
import type { DataSource } from 'typeorm';
import { chargerMigrations, connexionMigrations, differenceAvecEntites, sql, tables, verifierBaseJoignable } from '../partie-5/outils.js';
import { lancerAvecAuth } from '../partie-7/outils.js';
import { donnees } from '../partie-8/outils.js';
import { commander, creerMonde, ENV_P11, fileDuJob, lancerP11, pannePonctuelle, SECRET_WEBHOOK, statutDe, tableCommandes, type AppP11, type Monde } from './outils.js';

// Bonus de la section e (11.13 à 11.15) : le webhook de paiement, signé et idempotent. Ces tests ne
// tournent que si ton code importe `stripe` : sinon ils sont ignorés (« skipped »), pour que `npm test`
// reste vert sans le bonus. Aucun compte Stripe : le test signe lui-même ses livraisons
// (`generateTestHeaderString`), avec le secret qu'il donne à ton application (WEBHOOK_SECRET). La panne du
// 11.15 est posée dans PostgreSQL (un trigger), quelle que soit la façon dont ton code écrit.
// À faire toi-même : le message obtenu sans `rawBody` (11.13) ; le statut de la seconde livraison sans
// dédoublonnage, et ce que ferait le prestataire (11.14) ; ta phrase sur la commande inconnue (11.15).
const sources = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const bonusActif = Object.values(sources).some((code) => /from\s+['"]stripe['"]/.test(code));

const ROUTE = '/api/webhooks/paiements';
const INDICE_ROUTE = 'Ajoute `POST /api/webhooks/paiements` : `@Public()`, `@HttpCode(200)`, et `Stripe.webhooks.constructEvent(requete.rawBody, signature, WEBHOOK_SECRET)` (11.13).';

let numero = 0;
/** Un événement `paiement.reussi` neuf (identifiant jamais vu), en texte : envoyé tel quel. */
const paiement = (commandeId: number, espaces = false, id = `evt_test_${process.pid}_${++numero}`) => ({
  id,
  corps: JSON.stringify({ id, type: 'paiement.reussi', data: { object: { commandeId } } }, null, espaces ? 1 : undefined),
});
const signer = (corps: string, options: { secret?: string; timestamp?: number } = {}) => Stripe.webhooks.generateTestHeaderString({ payload: corps, secret: options.secret ?? SECRET_WEBHOOK, timestamp: options.timestamp });

describe.skipIf(!bonusActif)('Partie 11 · Bonus : webhooks et idempotence (exercices 11.13 à 11.15)', () => {
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
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  const livrer = (corps: string, signature: string | null = signer(corps), app: AppP11 | { http: AppP11['http'] } = lancee) => {
    const requete = app.http().post(ROUTE).set('Content-Type', 'application/json');
    if (signature !== null) requete.set('Stripe-Signature', signature);
    return requete.send(corps);
  };
  const nouvelleCommande = () => commander(lancee, m.carla, [{ varianteId: m.alice.variante, quantite: 1 }]);
  const recus = async (id: string) => Number((await sql<{ n: string }>('SELECT count(*) AS n FROM evenements_recus WHERE id = $1', [id]))[0]!.n);

  describe('11.13 · le paiement d\'une commande', () => {
    it('un événement `paiement.reussi` signé : 200, la commande passe à `payee`, et son expiration est annulée', async () => {
      const commandeId = await nouvelleCommande();
      expect(await fileDuJob(lancee.app, `expiration-${commandeId}`), 'la commande a son job d\'expiration (11.7)').not.toBeNull();
      // Un JSON écrit avec des espaces : seul le corps BRUT a la bonne signature (JSON.stringify ne remet pas les espaces).
      const { corps } = paiement(commandeId, true);
      const r = await livrer(corps);
      expect(r.status, `${INDICE_ROUTE} La signature se vérifie sur le corps BRUT (\`requete.rawBody\`), octet par octet : \`JSON.stringify(requete.body)\` ne redonne pas les espaces d'origine. Réponse : ${JSON.stringify(r.body)}`).toBe(200);
      expect(await statutDe(lancee, commandeId), 'la commande passe à `payee` avec `marquerPayee` (11.8)').toBe('payee');
      expect(await fileDuJob(lancee.app, `expiration-${commandeId}`), '`marquerPayee` annule le job `expiration-<id>`').toBeNull();
    });

    it('une signature fausse, un en-tête absent, une signature d\'il y a 10 minutes, un corps modifié : 400, et la commande reste `en_attente`', async () => {
      const commandeId = await nouvelleCommande();
      const { corps } = paiement(commandeId);
      const cas: [string, ReturnType<typeof livrer>, string][] = [
        ['signature fausse', livrer(corps, 't=123,v1=abc'), 'No signatures found'],
        ['signée avec un autre secret', livrer(corps, signer(corps, { secret: 'whsec_un-autre-secret' })), 'No signatures found'],
        ['sans en-tête Stripe-Signature', livrer(corps, null), 'stripe-signature'],
        ['signée il y a 10 minutes (un rejeu)', livrer(corps, signer(corps, { timestamp: Math.floor(Date.now() / 1000) - 600 })), 'Timestamp outside the tolerance zone'],
        ['corps modifié après signature', livrer(corps.replace(`"commandeId":${commandeId}`, `"commandeId":${commandeId} `), signer(corps)), 'No signatures found'],
      ];
      for (const [nom, envoi, raison] of cas) {
        const r = await envoi;
        expect(r.status, `${nom} : 400 (\`BadRequestException\` quand \`constructEvent\` lève une erreur). Réponse : ${JSON.stringify(r.body)}`).toBe(400);
        expect(JSON.stringify(r.body), `${nom} : le message donne la raison du SDK (« Signature refusée : ${raison}… »)`).toContain(raison);
      }
      expect(await statutDe(lancee, commandeId), 'aucune livraison refusée ne touche à la commande').toBe('en_attente');
    });
  });

  describe('11.14 · livré deux fois, payé une fois', () => {
    it('le même événement livré deux fois : la seconde livraison répond 200 avec `{ doublon: true }`', async () => {
      const commandeId = await nouvelleCommande();
      const { id, corps } = paiement(commandeId);
      const premiere = await livrer(corps);
      expect(premiere.status, JSON.stringify(premiere.body)).toBe(200);
      expect(donnees(premiere.body), 'la première livraison : `{ doublon: false }`').toMatchObject({ doublon: false });
      const seconde = await livrer(corps);
      expect(seconde.status, `un doublon n'est pas une erreur : sans dédoublonnage, \`transitionner\` refuse \`payee → payee\` et le prestataire, qui reçoit une erreur, réessaie encore et encore. Note l'événement dans \`evenements_recus\` (11.14). Réponse : ${JSON.stringify(seconde.body)}`).toBe(200);
      expect(donnees(seconde.body), 'la seconde livraison : `{ doublon: true }`').toMatchObject({ doublon: true });
      expect(await recus(id), 'l\'événement est noté une fois dans `evenements_recus` (l\'identifiant en clé primaire)').toBe(1);
      expect(await statutDe(lancee, commandeId)).toBe('payee');
    });

    it('trois livraisons simultanées : trois 200, un seul `doublon: false`, une seule ligne dans `evenements_recus`', async () => {
      const commandeId = await nouvelleCommande();
      const { id, corps } = paiement(commandeId);
      const reponses = await Promise.all([livrer(corps), livrer(corps), livrer(corps)]);
      expect(
        reponses.map((r) => r.status),
        `« chercher, puis écrire » laisse passer les trois livraisons en même temps : enregistre l'événement EN PREMIER, dans une transaction (\`dataSource.transaction\`), et traite le code 23505 comme un doublon (11.14). Réponses : ${JSON.stringify(reponses.map((r) => r.body))}`,
      ).toEqual([200, 200, 200]);
      expect(reponses.filter((r) => donnees(r.body)?.doublon === false), 'une seule livraison traitée (`doublon: false`), les deux autres sont des doublons').toHaveLength(1);
      expect(await recus(id)).toBe(1);
      expect(await statutDe(lancee, commandeId)).toBe('payee');
    });
  });

  describe('11.15 · panne, et événement inattendu', () => {
    it('une panne pendant le traitement : 500, rien n\'est noté, et la livraison suivante passe la commande à `payee`', async () => {
      const commandeId = await nouvelleCommande();
      const { id, corps } = paiement(commandeId);
      const retirer = await pannePonctuelle(tableCommandes(lancee), 'UPDATE', `NEW.id = ${commandeId} AND NEW.statut = 'payee'`);
      try {
        const r = await livrer(corps);
        expect(r.status, `la base tombe en panne pendant le paiement : l'erreur remonte (500), le prestataire réessaiera. Réponse : ${JSON.stringify(r.body)}`).toBe(500);
      } finally {
        await retirer();
      }
      expect(await statutDe(lancee, commandeId), 'la commande reste `en_attente`').toBe('en_attente');
      expect(await recus(id), 'la transaction annule AUSSI l\'enregistrement de l\'événement : sinon, la livraison suivante serait prise pour un doublon, et la commande jamais payée').toBe(0);
      const encore = await livrer(corps);
      expect(encore.status, JSON.stringify(encore.body)).toBe(200);
      expect(donnees(encore.body)).toMatchObject({ doublon: false });
      expect(await statutDe(lancee, commandeId), 'la nouvelle livraison est traitée').toBe('payee');
    });

    it('un `paiement.reussi` pour une commande qui n\'existe pas : un 200 (noté, ignoré) ou un 4xx, jamais un 500', async () => {
      const { corps } = paiement(987_654);
      const r = await livrer(corps);
      expect(r.status < 500, `décide de la réponse (un 200 avec l'événement noté et ignoré, ou un 4xx), mais pas une erreur interne. Réponse : ${r.status} ${JSON.stringify(r.body)}`).toBe(true);
    });
  });

  // En dernier : ces tests vident la base (une autre application, tes migrations).
  describe('11.13 · rawBody dans main.ts', () => {
    it('`main.ts` crée l\'application avec `rawBody: true` : une livraison signée y est acceptée', async () => {
      // L'application démarrée par ton main.ts (et non par configurerApp) : ses options de création.
      // Ton application, en test, vide la base à son démarrage (6.12) : on refait les données.
      const parMain = await lancerAvecAuth({ via: 'main', env: ENV_P11 });
      try {
        const autre = await creerMonde(parMain);
        const commandeId = await commander(parMain, autre.carla, [{ varianteId: autre.alice.variante, quantite: 1 }]);
        const { corps } = paiement(commandeId, true);
        const r = await livrer(corps, signer(corps), parMain);
        expect(r.status, `sans \`rawBody: true\` dans \`NestFactory.create(AppModule, { rawBody: true })\`, \`requete.rawBody\` est vide et la signature ne peut pas être vérifiée (11.13). Réponse : ${JSON.stringify(r.body)}`).toBe(200);
        expect(await statutDe(parMain, commandeId)).toBe('payee');
      } finally {
        await parMain.fermer();
      }
    });
  });

  describe('11.14 · la migration', () => {
    it('tes migrations créent la table `evenements_recus` telle que la décrit l\'entité', async () => {
      await verifierBaseJoignable();
      let ds: DataSource | undefined;
      try {
        ds = await connexionMigrations(lancee.ds.entityMetadatas.map((x) => x.target), await chargerMigrations());
        await ds.dropDatabase();
        await ds.runMigrations();
        expect(await tables(), 'aucune de tes migrations ne crée la table `evenements_recus` : génère-la (`npm run migration:generate -- src/migrations/CreerEvenementsRecus`)').toContain('evenements_recus');
        const restantes = (await differenceAvecEntites(ds)).filter((q) => q.includes('"evenements_recus"'));
        expect(restantes, 'après tes migrations, la table `evenements_recus` ne correspond pas à son entité').toEqual([]);
      } finally {
        await ds?.dropDatabase().catch(() => undefined);
        await ds?.destroy();
        await lancee.ds.synchronize();
      }
    });
  });
});
