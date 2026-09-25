import { createHash } from 'node:crypto';
import { entite, relationVers, sql } from '../partie-5/outils.js';
import { donnees } from '../partie-8/outils.js';
import { creerMonde, files, lancerP11, pannePonctuelle, Surveillance, viderFiles, type AppP11, type Monde } from './outils.js';

// Bonus de la section d (11.10 à 11.12) : l'import d'un catalogue CSV dans une file de tâches. Ces tests
// ne tournent que si ton code déclare une route `…/imports` : sinon ils sont ignorés (« skipped »), pour
// que `npm test` reste vert sans le bonus. Pour faire échouer UNE écriture (11.11), le test pose une panne
// dans PostgreSQL lui-même (un trigger), quelle que soit la façon dont ton worker écrit.
// À faire toi-même : ta phrase sur `removeOnComplete` (11.12).
const sources = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const bonusActif = Object.values(sources).some((code) => /@(Post|Get|Controller)\(\s*['"`][^'"`]*imports/.test(code));

const INDICE_ROUTE = '`POST /api/vendeurs/:vendeurId/imports` dépose un job dans la file `imports` et répond 202 avec `{ importId }`, l\'identifiant du job (11.10).';
const INDICE_WORKER = 'Le worker de la file `imports` (`@Processor(\'imports\')`) crée les produits et renvoie `{ crees, erreurs: [{ ligne, message }] }` (11.10).';

describe.skipIf(!bonusActif)('Partie 11 · Bonus : les files de tâches (exercices 11.10 à 11.12)', () => {
  let lancee: AppP11;
  let m: Monde;
  let surveillance: Surveillance;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerP11();
      m = await creerMonde(lancee);
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

  const importer = (csv: string, bearer = m.alice.bearer, vendeurId = m.alice.boutique) =>
    lancee.http().post(`/api/vendeurs/${vendeurId}/imports`).set('Authorization', bearer).send({ csv });
  const etatDe = (importId: string) => lancee.http().get(`/api/imports/${importId}`).set('Authorization', m.alice.bearer);

  /** Dépose un import (202 attendu) ; son identifiant. */
  async function deposer(csv: string): Promise<string> {
    const r = await importer(csv);
    expect(r.status, `${INDICE_ROUTE} Réponse : ${JSON.stringify(r.body)}`).toBe(202);
    const importId = donnees<{ importId?: unknown }>(r.body)?.importId;
    expect(typeof importId === 'string' && importId !== '', `la réponse contient \`importId\` (l'identifiant du job, \`job.id\`). Reçu : ${JSON.stringify(r.body)}`).toBe(true);
    return importId as string;
  }

  /** La file (de ton application) qui contient cet import. */
  async function fileDe(importId: string) {
    for (const file of files(lancee.app)) if (await file.getJob(importId)) return file;
    throw new Error(`Aucun job \`${importId}\` dans tes files : l'importId renvoyé doit être l'identifiant du job (\`job.id\`).`);
  }

  /** Les noms des produits de la boutique d'Alice, en base. */
  async function produitsDAlice(): Promise<string[]> {
    const produit = entite(lancee.ds, 'Produit', '');
    const versVendeur = relationVers(produit, 'Vendeur', 'many-to-one')!;
    const colonne = versVendeur.joinColumns[0]!.databaseName;
    return (await sql<{ nom: string }>(`SELECT nom FROM "${produit.tableName}" WHERE "${colonne}" = $1 ORDER BY id`, [m.alice.boutique])).map((p) => p.nom);
  }

  let numero = 0;
  /** Un CSV neuf (des noms jamais vus dans ce fichier de test). */
  const catalogue = (lignes: string[]) => ['nom;prix;categorie', ...lignes].join('\n');
  const nom = (base: string) => `${base} ${++numero}`;

  describe('11.10 · importer un catalogue en CSV', () => {
    it('202 et `{ importId }` ; le worker crée les produits valides ; `GET /api/imports/:importId` donne l\'état et le résultat', async () => {
      const [table, chaise, stylo, lampe] = [nom('Table'), nom('Chaise'), nom('Stylo'), nom('Lampe')];
      const csv = catalogue([`${table};120;mobilier`, `${chaise};45;mobilier`, `${stylo};2;papeterie`, `${lampe};-5;mobilier`]);
      const importId = await deposer(csv);
      const fin = await surveillance.fin(importId, INDICE_WORKER, 10_000, await fileDe(importId));
      expect(fin.etat, `l'import a échoué : ${String(fin.valeur)}`).toBe('completed');

      const r = await etatDe(importId);
      expect(r.status, `GET /api/imports/${importId}. Réponse : ${JSON.stringify(r.body)}`).toBe(200);
      const { etat, resultat } = donnees(r.body) ?? {};
      expect(etat, '`etat` : l\'état BullMQ du job (`await job.getState()`)').toBe('completed');
      expect(resultat?.crees, `\`resultat\` : \`job.returnvalue\`, soit \`{ crees: 3, erreurs: [...] }\`. Reçu : ${JSON.stringify(resultat)}`).toBe(3);
      expect(resultat?.erreurs?.length, `une seule erreur, la ligne au prix négatif. Reçu : ${JSON.stringify(resultat?.erreurs)}`).toBe(1);
      expect(resultat.erreurs[0].ligne, 'le numéro de la ligne fautive, en comptant l\'en-tête comme ligne 1 (la ligne 5)').toBe(5);
      expect(String(resultat.erreurs[0].message), 'le message dit ce qui ne va pas : « prix doit être un nombre positif »').toMatch(/prix/);
      expect(await produitsDAlice(), 'les trois produits valides sont en base, pas celui au prix négatif').toEqual(expect.arrayContaining([table, chaise, stylo]));
      expect(await produitsDAlice()).not.toContain(lampe);
    });

    it('réservé au propriétaire du vendeur (et aux admins) : un autre vendeur reçoit 403', async () => {
      const r = await importer(catalogue([`${nom('Intrus')};10;mobilier`]), m.bob.bearer);
      expect(r.status, 'protège la route avec le guard de l\'exercice 8.8 (`@UseGuards(ProprietaireVendeurGuard)`)').toBe(403);
      const admin = await importer(catalogue([`${nom('Par un admin')};10;mobilier`]), m.admin.bearer);
      expect(admin.status, 'un admin passe outre la propriété').toBe(202);
    });

    it('`GET /api/imports/:importId` d\'un import inconnu : 404', async () => {
      const r = await etatDe('import-inconnu-0000');
      expect(r.status, '`getJob` renvoie `undefined` : `NotFoundException`').toBe(404);
    });
  });

  describe('11.11 · réessayer sans doublon', () => {
    it('une écriture échoue une fois : le job réussit à la deuxième tentative, avec trois produits en base (pas cinq)', async () => {
      const noms = [nom('Bureau'), nom('Étagère'), nom('Tabouret')];
      const table = entite(lancee.ds, 'Produit', '').tableName;
      const retirer = await pannePonctuelle(table, 'INSERT', `NEW.nom = '${noms[2]}'`);
      try {
        const debut = Date.now();
        const importId = await deposer(catalogue(noms.map((n) => `${n};80;mobilier`)));
        const file = await fileDe(importId);
        const fin = await surveillance.fin(importId, 'Donne aux imports `attempts: 3` : une tentative ratée est rejouée (11.11).', 10_000, file);
        const duree = Date.now() - debut;
        expect(fin.etat, `le job doit réussir à la deuxième tentative (\`attempts: 3\`). Raison de l'échec : ${String(fin.valeur)}`).toBe('completed');
        const job = (await file.getJob(importId))!;
        expect(job, 'garde le job terminé (`removeOnComplete: { age: ... }`) : sinon plus d\'état à lire, ni de doublon à refuser (11.12)').toBeDefined();
        expect(job.attemptsMade, '`attemptsMade` vaut 2 : une tentative ratée, puis la bonne').toBe(2);
        expect(job.opts.attempts, '`attempts: 3`').toBe(3);
        expect(job.opts.backoff, 'un backoff exponentiel de 200 ms : `backoff: { type: \'exponential\', delay: 200 }`').toMatchObject({ type: 'exponential', delay: 200 });
        expect(duree, 'la seconde tentative attend le backoff (200 ms au moins)').toBeGreaterThanOrEqual(200);
        const crees = (await produitsDAlice()).filter((n) => noms.includes(n));
        expect(
          crees.sort(),
          'chaque tentative recommence TOUT : rends l\'import idempotent (une transaction pour tout le fichier, ou les produits déjà créés sautés), sinon les deux premiers produits sont créés deux fois',
        ).toEqual([...noms].sort());
      } finally {
        await retirer();
      }
    });

    it('un CSV sans la ligne d\'en-tête : échec après UNE tentative (`UnrecoverableError`), et `GET` renvoie `failed` et la raison', async () => {
      const importId = await deposer(`${nom('Sans en-tête')};10;mobilier`);
      const file = await fileDe(importId);
      const fin = await surveillance.fin(importId, 'Un fichier sans en-tête doit faire échouer le job (`throw new UnrecoverableError(...)`, 11.11).', 10_000, file);
      expect(fin.etat, 'le job doit échouer').toBe('failed');
      const job = (await file.getJob(importId))!;
      expect(job.attemptsMade, '`UnrecoverableError` (de bullmq) : inutile de réessayer, une seule tentative malgré `attempts: 3`').toBe(1);
      const r = await etatDe(importId);
      expect(r.status).toBe(200);
      const corps = donnees(r.body) ?? {};
      expect(corps.etat, '`etat` : `failed`').toBe('failed');
      expect(JSON.stringify(corps), `la réponse donne la raison de l'échec (\`job.failedReason\` : « ${job.failedReason} »)`).toContain(JSON.stringify(job.failedReason).slice(1, -1));
    });
  });

  describe('11.12 · un import, pas deux', () => {
    const attendu = (csv: string) => `import-${m.alice.boutique}-${createHash('sha256').update(csv).digest('hex').slice(0, 16)}`;

    it('deux POST identiques : le même `importId` (vendeur + empreinte du fichier), un seul job, des produits créés une fois', async () => {
      const unique = nom('Commode');
      const csv = catalogue([`${unique};300;mobilier`]);
      const [premier, second] = [await deposer(csv), await deposer(csv)];
      expect(premier, 'le jobId : `import-<vendeurId>-<les 16 premiers caractères du SHA-256 du csv>` (`createHash(\'sha256\').update(csv).digest(\'hex\').slice(0, 16)`)').toBe(attendu(csv));
      expect(second, 'le même fichier renvoyé : le même importId').toBe(premier);
      const file = await fileDe(premier);
      await surveillance.fin(premier, INDICE_WORKER, 10_000, file);
      const comptes = await file.getJobCounts();
      expect(Object.values(comptes).reduce((a, b) => a + b, 0), `un seul job dans la file. Comptes : ${JSON.stringify(comptes)}`).toBe(1);

      // Après la fin de l'import : toujours ignoré, tant que le job terminé est gardé.
      const troisieme = await deposer(csv);
      expect(troisieme).toBe(premier);
      expect((await file.getJobCounts()).completed, 'le job terminé est gardé (`removeOnComplete: { age: ... }`) : le même fichier est encore ignoré').toBe(1);
      expect((await produitsDAlice()).filter((n) => n === unique), 'le produit n\'est créé qu\'une fois').toEqual([unique]);
    });

    it('un fichier différent d\'un seul caractère : un nouvel import', async () => {
      const unique = nom('Buffet');
      const csv = catalogue([`${unique};300;mobilier`]);
      const premier = await deposer(csv);
      await surveillance.fin(premier, INDICE_WORKER, 10_000, await fileDe(premier));
      const autre = catalogue([`${unique};301;mobilier`]);
      const second = await deposer(autre);
      expect(second, 'une autre empreinte, un autre job').toBe(attendu(autre));
      expect(second).not.toBe(premier);
      await surveillance.fin(second, INDICE_WORKER, 10_000, await fileDe(second));
      expect((await produitsDAlice()).filter((n) => n === unique)).toEqual([unique, unique]);
    });
  });
});
