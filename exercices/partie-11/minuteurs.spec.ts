import { sql } from '../partie-5/outils.js';
import { chargerExport } from '../partie-10/outils.js';
import {
  attendre,
  collecter,
  commander,
  creerMonde,
  fileDuJob,
  files,
  jetonDe,
  lancerP11,
  ouvrir,
  ouvrirFile,
  statutDe,
  Surveillance,
  synchroniser,
  tableCommandes,
  viderFiles,
  workers,
  type AppP11,
  type Monde,
} from './outils.js';

// 11.7 : le job différé `expiration-<id>` qui annule une commande impayée ; 11.8 : payer arrête le
// minuteur ; 11.9 : le minuteur survit au redémarrage, et deux instances se partagent les salles grâce à
// l'adaptateur Redis. De vrais jobs, dans le Redis des tests (tes files sont vidées avant chaque test).
// À faire toi-même : l'identifiant `expiration:12` et son erreur (11.7) ; ce que répond `file.remove(…)`
// pour un identifiant inconnu (11.8) ; l'erreur de ton test sans adaptateur (11.9).

const INDICE_JOB =
  'À la création d\'une commande, programme `file.add(\'expiration\', { commandeId }, { jobId: `expiration-${commandeId}`, delay: <DELAI_PAIEMENT_MS> })` (avec `@InjectQueue(...)`, et `BullModule.forRootAsync(...)` dans AppModule, exercice 11.7).';
const INDICE_WORKER =
  'Écris le worker (`@Processor(\'<ta file>\')`, qui hérite de `WorkerHost`) : `process(job)` passe la commande à `annulee` si elle est `en_attente` (avec `transitionner`) et renvoie `\'annulee\'`, sinon renvoie `\'ignoré\'` (11.7).';
const INDICE_STATUT = 'Le worker émet `commande:statut` avec `{ commandeId, statut: \'annulee\' }` dans la salle `compte:<id>` de l\'acheteur (11.7).';

/** Les commandes d'un monde neuf : une variante d'Alice, commandée par Carla. */
const ligne = (m: Monde) => [{ varianteId: m.alice.variante, quantite: 1 }];

describe('Partie 11 · Les minuteurs (exercices 11.7 à 11.9)', () => {
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  describe('11.7 et 11.8 · annuler les commandes impayées, payer arrête le minuteur', () => {
    let lancee: AppP11;
    let m: Monde;
    let surveillance: Surveillance;
    beforeAll(async () => {
      try {
        lancee = await lancerP11({ env: { DELAI_PAIEMENT_MS: '60000' } });
        m = await creerMonde(lancee);
        if (files(lancee.app).length === 0) throw new Error(`Aucune file BullMQ dans ton application. ${INDICE_JOB}`);
        surveillance = await Surveillance.de(files(lancee.app));
      } catch (erreur) {
        echec = erreur;
      }
    });
    beforeEach(() => lancee && viderFiles(lancee.app));
    afterAll(async () => {
      await surveillance?.fermer();
      await lancee?.fermer();
    });

    /** Une commande neuve, et son job d'expiration (dans la file où il se trouve). */
    async function commandeEtSonJob() {
      const commandeId = await commander(lancee, m.carla, ligne(m));
      const trouve = await fileDuJob(lancee.app, `expiration-${commandeId}`);
      if (!trouve) throw new Error(`Aucun job \`expiration-${commandeId}\` dans tes files après POST /api/commandes. ${INDICE_JOB}`);
      return { commandeId, ...trouve };
    }

    it('11.7 · une commande créée programme un job différé `expiration`, d\'identifiant `expiration-<id>`, au délai DELAI_PAIEMENT_MS', async () => {
      const { job } = await commandeEtSonJob();
      expect(job.name, 'le nom du job : `\'expiration\'` (premier argument de `add`)').toBe('expiration');
      expect(await job.getState(), 'un job DIFFÉRÉ (`delay`), qui attend dans Redis').toBe('delayed');
      expect(job.opts.delay, 'le délai vient de ta configuration : `Number(config.get(\'DELAI_PAIEMENT_MS\'))` (les tests fixent DELAI_PAIEMENT_MS=60000)').toBe(60000);
    });

    it('11.7 · à l\'heure dite, le worker annule la commande, prévient l\'acheteur, et renvoie « annulee »', async () => {
      const carla = await ouvrir(lancee, jetonDe(m.carla));
      const statut = attendre(carla, 'commande:statut', INDICE_STATUT, 5000);
      const { commandeId, job } = await commandeEtSonJob();
      const fin = surveillance.fin(job.id!, INDICE_WORKER);
      // L'heure est venue : on avance le job (sans attendre 60 s).
      await job.promote();
      const { etat, valeur } = await fin;
      expect(etat, `le job a échoué : ${String(valeur)}`).toBe('completed');
      expect(valeur, `le résultat du job (ce que renvoie \`process\`). ${INDICE_WORKER}`).toBe('annulee');
      expect(await statutDe(lancee, commandeId), 'la commande est `annulee` en base').toBe('annulee');
      expect(await statut).toEqual({ commandeId, statut: 'annulee' });
    });

    it('11.7 · une commande qui n\'est plus `en_attente` : le job renvoie « ignoré » sans rien changer, et personne n\'est prévenu', async () => {
      const carla = await ouvrir(lancee, jetonDe(m.carla));
      const recus = collecter(carla, 'commande:statut');
      const { commandeId, job } = await commandeEtSonJob();
      await sql(`UPDATE "${tableCommandes(lancee)}" SET statut = 'payee' WHERE id = $1`, [commandeId]);
      const fin = surveillance.fin(job.id!, INDICE_WORKER);
      await job.promote();
      const { etat, valeur } = await fin;
      expect(etat, `le job a échoué : ${String(valeur)}`).toBe('completed');
      expect(valeur, 'un job périmé (la commande a changé entre-temps) renvoie `\'ignoré\'`').toBe('ignoré');
      expect(await statutDe(lancee, commandeId), 'la commande reste `payee`').toBe('payee');
      await synchroniser(lancee, carla);
      expect(recus, 'aucun `commande:statut` pour un job ignoré').toEqual([]);
    });

    it('11.8 · `CommandesService.marquerPayee(id)` : la commande est `payee`, et son job d\'expiration a disparu de Redis', async () => {
      const CommandesService = await chargerExport<new (...args: never[]) => { marquerPayee?: (id: number) => Promise<unknown> }>('CommandesService', 'Le service des commandes (exercice 5.12).');
      let service: { marquerPayee?: (id: number) => Promise<unknown> };
      try {
        service = lancee.app.get(CommandesService, { strict: false });
      } catch {
        throw new Error('`CommandesService` introuvable dans ton application (exercice 5.12).');
      }
      expect(typeof service.marquerPayee, 'ajoute `marquerPayee(id)` à CommandesService (11.8)').toBe('function');
      const { commandeId, file } = await commandeEtSonJob();
      expect(await file.getDelayedCount()).toBe(1);
      await service.marquerPayee!(commandeId);
      expect(await statutDe(lancee, commandeId), 'marquerPayee passe la commande à `payee` (avec `transitionner`)').toBe('payee');
      expect(await file.getJob(`expiration-${commandeId}`), 'marquerPayee annule le job : `const job = await file.getJob(\'expiration-<id>\'); await job?.remove();`').toBeUndefined();
      expect(await file.getDelayedCount(), 'plus aucun job en attente').toBe(0);
    });
  });

  describe('11.7 · pour de vrai : DELAI_PAIEMENT_MS=200', () => {
    it('une commande impayée est annulée toute seule, et l\'acheteur le reçoit', async () => {
      const lancee = await lancerP11({ env: { DELAI_PAIEMENT_MS: '200' } });
      let surveillance: Surveillance | undefined;
      try {
        await viderFiles(lancee.app);
        surveillance = await Surveillance.de(files(lancee.app));
        const m = await creerMonde(lancee);
        const carla = await ouvrir(lancee, jetonDe(m.carla));
        const statut = attendre(carla, 'commande:statut', INDICE_STATUT, 5000);
        const commandeId = await commander(lancee, m.carla, ligne(m));
        const { etat, valeur } = await surveillance.fin(`expiration-${commandeId}`, `${INDICE_JOB} ${INDICE_WORKER}`);
        expect([etat, valeur], 'le job se termine, et renvoie « annulee »').toEqual(['completed', 'annulee']);
        expect(await statut).toEqual({ commandeId, statut: 'annulee' });
        expect(await statutDe(lancee, commandeId)).toBe('annulee');
        expect(surveillance.differes.has(`expiration-${commandeId}`), 'le job était différé (`delay`), pas exécuté tout de suite').toBe(true);
      } finally {
        await surveillance?.fermer();
        await lancee.fermer();
      }
    });
  });

  describe('11.9 · redémarrer, et deux serveurs', () => {
    it('le minuteur survit à un redémarrage : le job attend dans Redis, et le worker de la nouvelle application annule la commande', async () => {
      // 5 s : de quoi arrêter l'application et en démarrer une autre avant l'heure.
      const premiere = await lancerP11({ env: { DELAI_PAIEMENT_MS: '5000' } });
      let seconde: AppP11 | undefined;
      let surveillance: Surveillance | undefined;
      let file: ReturnType<typeof ouvrirFile> | undefined;
      let premiereFermee = false;
      try {
        await viderFiles(premiere.app);
        const m = await creerMonde(premiere);
        const commandeId = await commander(premiere, m.carla, ligne(m));
        const trouve = await fileDuJob(premiere.app, `expiration-${commandeId}`);
        if (!trouve) throw new Error(`Aucun job \`expiration-${commandeId}\` dans tes files. ${INDICE_JOB}`);
        const { name, opts } = trouve.file;
        // Ce qu'il faudra remettre en base : en test, ton application vide la base à chaque démarrage (6.12).
        const table = tableCommandes(premiere);
        const [commande] = await sql(`SELECT * FROM "${table}" WHERE id = $1`, [commandeId]);
        const comptes = premiere.ds.entityMetadatas.find((e) => e.name === 'Compte')!.tableName;
        const [acheteur] = await sql(`SELECT * FROM "${comptes}" WHERE id = $1`, [m.carla.id]);
        await premiere.fermer();
        premiereFermee = true;

        file = ouvrirFile(name, opts.prefix);
        const job = await file.getJob(`expiration-${commandeId}`);
        expect(job, 'après l\'arrêt de l\'application, le job doit être encore dans Redis : ne le retire pas à l\'arrêt, et n\'utilise pas `setTimeout` (le minuteur mourrait avec le processus)').toBeDefined();
        expect(await job!.getState()).toBe('delayed');
        surveillance = await Surveillance.de([{ name, opts }]);

        seconde = await lancerP11({ env: { DELAI_PAIEMENT_MS: '5000' }, base: 'garder' });
        const inserer = async (t: string, ligneSql: Record<string, unknown>) => {
          const cles = Object.keys(ligneSql);
          await sql(`INSERT INTO "${t}" (${cles.map((c) => `"${c}"`).join(', ')}) VALUES (${cles.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT DO NOTHING`, Object.values(ligneSql));
        };
        await inserer(comptes, acheteur!);
        await inserer(table, commande!);
        expect(await file.getDelayedCount(), 'le job attend toujours, dans Redis').toBe(1);
        const { etat, valeur } = await surveillance.fin(`expiration-${commandeId}`, 'Le worker de la NOUVELLE application doit prendre le job à l\'heure dite (11.9).', 10_000);
        expect([etat, valeur]).toEqual(['completed', 'annulee']);
        expect(await statutDe(seconde, commandeId), 'la commande finit `annulee`').toBe('annulee');
      } finally {
        await surveillance?.fermer();
        await file?.close();
        await seconde?.fermer();
        if (!premiereFermee) await premiere.fermer();
      }
    });

    it('deux instances : l\'acheteur connecté à A reçoit `commande:statut` quand c\'est le worker de B qui traite le job', async () => {
      const a = await lancerP11({ env: { DELAI_PAIEMENT_MS: '0' } });
      let b: AppP11 | undefined;
      try {
        b = await lancerP11({ env: { DELAI_PAIEMENT_MS: '0' }, base: 'garder' });
        await viderFiles(a.app);
        const m = await creerMonde(a);
        const workersDeA = workers(a.app);
        expect(workersDeA.length, 'aucun worker BullMQ trouvé dans ton application (`@Processor(...)` + `WorkerHost`, 11.7)').toBeGreaterThan(0);
        for (const w of workersDeA) await w.pause();
        expect(workers(b.app).some((w) => w.isRunning() && !w.isPaused()), 'le worker de B tourne').toBe(true);

        const carla = await ouvrir(a, jetonDe(m.carla));
        const statut = attendre(
          carla,
          'commande:statut',
          'L\'acheteur est connecté à l\'instance A ; c\'est le worker de B qui a annulé la commande, et B ne connaît que ses propres sockets. Branche `RedisIoAdapter` (`app.useWebSocketAdapter(...)`) dans configurerApp, pas seulement dans main.ts (11.9).',
          5000,
        );
        const commandeId = await commander(a, m.carla, ligne(m));
        expect(await statut).toEqual({ commandeId, statut: 'annulee' });
      } finally {
        await b?.fermer();
        await a.fermer();
      }
    });
  });
});
