import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { DataSource, EntityManager } from 'typeorm';
import { ImportsProcessor } from '../src/imports/imports.processor.js';
import { FILE_IMPORTS, idImport } from '../src/imports/imports.service.js';
import { Produit } from '../src/produits/produit.entity.js';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// Bonus 11.10 à 11.12 : l'import d'un catalogue CSV, dans une file de tâches.
describe('Imports (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let file: Queue;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
    file = app.get<Queue>(getQueueToken(FILE_IMPORTS));
  });

  beforeEach(async () => {
    await file.obliterate({ force: true });
    await viderLaBase(dataSource);
    ({ bearer: alice } = await compteConnecte(http, dataSource, 'alice@exemple.fr', 'vendeur'));
    ({ bearer: bob } = await compteConnecte(http, dataSource, 'bob@exemple.fr', 'vendeur'));
    await http().post('/api/vendeurs').set('Authorization', alice).send({ nom: 'Chez Alice' }).expect(201);
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await app.close();
  });

  /** Attend que le worker ait fini ce job, en succès ou en échec définitif. */
  const issue = (jobId: string) =>
    new Promise<{ etat: 'termine' | 'echoue'; job: Job }>((resolve) => {
      const worker = app.get(ImportsProcessor).worker;
      const surFin = (job: Job) => {
        if (job.id !== jobId) return;
        arreter();
        resolve({ etat: 'termine', job });
      };
      const surEchec = (job: Job | undefined) => {
        if (!job || job.id !== jobId || (job.attemptsMade < (job.opts.attempts ?? 1) && job.finishedOn === undefined)) return;
        arreter();
        resolve({ etat: 'echoue', job });
      };
      const arreter = () => {
        worker.off('completed', surFin);
        worker.off('failed', surEchec);
      };
      worker.on('completed', surFin);
      worker.on('failed', surEchec);
    });

  const CSV = 'nom;prix;categorie\nTable;120;mobilier\nChaise;45;mobilier\nStylo;2;papeterie\nLampe;-5;mobilier';
  const importer = (csv: string, bearer = alice) => http().post('/api/vendeurs/1/imports').set('Authorization', bearer).send({ csv });
  const noms = async () => (await dataSource.query('SELECT nom FROM produits ORDER BY id')).map((p: { nom: string }) => p.nom);

  it('importe les lignes valides, et rend compte des autres', async () => {
    const fin = issue(idImport(1, CSV));
    const reponse = await importer(CSV).expect(202);
    expect(reponse.body.data).toEqual({ importId: idImport(1, CSV) });
    await fin;
    const etat = await http().get(`/api/imports/${idImport(1, CSV)}`).set('Authorization', alice).expect(200);
    expect(etat.body.data).toEqual({ etat: 'completed', resultat: { crees: 3, erreurs: [{ ligne: 5, message: 'prix doit être un nombre positif' }] } });
    expect(await noms()).toEqual(['Table', 'Chaise', 'Stylo']);
    await importer(CSV, bob).expect(403);
  });

  it('réessaie après une panne, sans créer de doublon', async () => {
    const original = EntityManager.prototype.save;
    let produits = 0;
    vi.spyOn(EntityManager.prototype, 'save').mockImplementation(function (this: EntityManager, ...args: unknown[]) {
      if (args[0] === Produit && ++produits === 3) return Promise.reject(new Error('Base indisponible'));
      return (original as (...a: unknown[]) => Promise<unknown>).apply(this, args);
    } as never);
    const fin = issue(idImport(1, CSV));
    await importer(CSV).expect(202);
    const { etat, job } = await fin;
    expect(etat).toBe('termine');
    expect(job.attemptsMade).toBe(2);
    expect(await noms()).toEqual(['Table', 'Chaise', 'Stylo']);
  });

  it('n\'insiste pas sur un fichier sans en-tête', async () => {
    const csv = 'Table;120;mobilier';
    const fin = issue(idImport(1, csv));
    await importer(csv).expect(202);
    const { etat, job } = await fin;
    expect(etat).toBe('echoue');
    expect(job.attemptsMade).toBe(1);
    const reponse = await http().get(`/api/imports/${idImport(1, csv)}`).set('Authorization', alice).expect(200);
    expect(reponse.body.data).toMatchObject({ etat: 'failed', raison: 'En-tête attendu : nom;prix;categorie' });
  });

  it('un même fichier n\'est importé qu\'une fois, même renvoyé après la fin', async () => {
    const fin = issue(idImport(1, CSV));
    const [premier, second] = await Promise.all([importer(CSV).expect(202), importer(CSV).expect(202)]);
    expect(second.body.data.importId).toBe(premier.body.data.importId);
    await fin;
    await importer(CSV).expect(202);
    expect(await file.getJobCounts('completed', 'waiting', 'delayed', 'active')).toEqual({ completed: 1, waiting: 0, delayed: 0, active: 0 });
    expect(await noms()).toHaveLength(3);
    const autre = `${CSV}\n`;
    expect((await importer(autre).expect(202)).body.data.importId).not.toBe(premier.body.data.importId);
  });
});
