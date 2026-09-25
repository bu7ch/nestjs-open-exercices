import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { CommandesService } from '../src/commandes/commandes.service.js';
import { FILE_EXPIRATIONS, idExpiration } from '../src/commandes/expiration.js';
import { ExpirationProcessor } from '../src/commandes/expiration.processor.js';
import { attendre, compteConnecte, connecter, demarrerApp, viderLaBase, type ClientDeCommandes } from './app-de-test.js';

// 11.7 à 11.9 : l'expiration des commandes impayées, avec de vrais jobs BullMQ dans Redis.
// DELAI_PAIEMENT_MS vaut 1 h dans vitest.config.e2e.ts (lu une fois, au chargement d'AppModule) : les
// tests avancent le job quand ils veulent qu'il s'exécute (`job.promote()`), sans attendre.
describe('Expiration des commandes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let url: string;
  let file: Queue;
  let carla: { accessToken: string; bearer: string };
  const ouverts: ClientDeCommandes[] = [];

  async function preparer() {
    await file.obliterate({ force: true });
    await viderLaBase(dataSource);
    const alice = await compteConnecte(http, dataSource, 'alice@exemple.fr', 'vendeur');
    carla = await compteConnecte(http, dataSource, 'carla@exemple.fr');
    const bearer = `Bearer ${alice.accessToken}`;
    const v = await http().post('/api/vendeurs').set('Authorization', bearer).send({ nom: 'Chez Alice' }).expect(201);
    const p = await http().post(`/api/vendeurs/${v.body.data.id}/produits`).set('Authorization', bearer).send({ nom: 'Table', prix: 30, categorie: 'mobilier' }).expect(201);
    await http().post(`/api/produits/${p.body.data.id}/variantes`).set('Authorization', bearer).send({ nom: 'Rouge' }).expect(201);
  }

  async function demarrer() {
    ({ app, dataSource, http, url } = await demarrerApp());
    file = app.get<Queue>(getQueueToken(FILE_EXPIRATIONS));
  }

  const commander = async () => (await http().post('/api/commandes').set('Authorization', carla.bearer).send({ lignes: [{ varianteId: 1, quantite: 1 }] }).expect(201)).body.data.id as number;
  const statutDe = async (id: number) => (await dataSource.query('SELECT statut FROM commandes WHERE id = $1', [id]))[0].statut as string;

  /** Le résultat du job, quand le worker de CETTE application l'a terminé. */
  const termine = (jobId: string) =>
    new Promise((resolve) => {
      const worker = app.get(ExpirationProcessor).worker;
      const surFin = (job: { id?: string; returnvalue: unknown }) => {
        if (job.id !== jobId) return;
        worker.off('completed', surFin);
        resolve(job.returnvalue);
      };
      worker.on('completed', surFin);
    });

  beforeAll(() => demarrer());
  beforeEach(() => preparer());
  afterEach(() => {
    for (const client of ouverts.splice(0)) client.close();
  });
  afterAll(async () => {
    await app.close();
  });

  it('programme un job différé à la création, qui annule la commande et prévient l\'acheteur', async () => {
    const client = await connecter(url, carla.accessToken);
    ouverts.push(client);
    const statut = attendre(client, 'commande:statut');
    const id = await commander();
    const job = await file.getJob(idExpiration(id));
    expect(await job?.getState()).toBe('delayed');
    expect(job?.delay).toBe(3600000);
    const fini = termine(idExpiration(id));
    await job!.promote();
    expect(await fini).toBe('annulee');
    expect(await statut).toEqual({ commandeId: id, statut: 'annulee' });
    expect(await statutDe(id)).toBe('annulee');
  });

  it('un job périmé ne change rien', async () => {
    const id = await commander();
    await dataSource.query('UPDATE commandes SET statut = \'payee\' WHERE id = $1', [id]);
    const fini = termine(idExpiration(id));
    await (await file.getJob(idExpiration(id)))!.promote();
    expect(await fini).toBe('ignoré');
    expect(await statutDe(id)).toBe('payee');
  });

  it('payer arrête le minuteur', async () => {
    const id = await commander();
    await app.get(CommandesService).marquerPayee(id);
    expect(await file.getJob(idExpiration(id))).toBeUndefined();
    expect(await file.getDelayedCount()).toBe(0);
    expect(await statutDe(id)).toBe('payee');
  });

  it('survit à un redémarrage du serveur', async () => {
    const id = await commander();
    // En test, l'application vide la base à son démarrage (6.12) : on garde la commande pour la remettre.
    const [commande] = await dataSource.query('SELECT * FROM commandes WHERE id = $1', [id]);
    const [compte] = await dataSource.query('SELECT * FROM comptes WHERE id = $1', [commande.acheteurId]);
    await app.close(); // le serveur s'arrête, le job attend dans Redis

    await demarrer();
    await dataSource.query('INSERT INTO comptes (id, email, "motDePasseHache", role) VALUES ($1, $2, $3, $4)', [compte.id, compte.email, compte.motDePasseHache, compte.role]);
    await dataSource.query('INSERT INTO commandes (id, statut, "acheteurId") VALUES ($1, $2, $3)', [id, commande.statut, commande.acheteurId]);
    expect(await file.getDelayedCount()).toBe(1);
    // L'heure est venue : c'est le worker de la NOUVELLE application qui prend le job.
    const fini = termine(idExpiration(id));
    await (await file.getJob(idExpiration(id)))!.promote();
    expect(await fini).toBe('annulee');
    expect(await statutDe(id)).toBe('annulee');
  });

  it('deux instances : l\'acheteur connecté à A apprend l\'annulation faite par le worker de B', async () => {
    const a = { app, http, url, dataSource };
    await demarrer();
    const b = { app };
    try {
      app = a.app;
      ({ http, url, dataSource } = a);
      file = app.get<Queue>(getQueueToken(FILE_EXPIRATIONS));
      await preparer();
      await a.app.get(ExpirationProcessor).worker.pause();
      const client = await connecter(url, carla.accessToken);
      ouverts.push(client);
      const statut = attendre(client, 'commande:statut');
      const id = await commander();
      await (await file.getJob(idExpiration(id)))!.promote();
      expect(await statut).toEqual({ commandeId: id, statut: 'annulee' });
    } finally {
      await b.app.close();
      await a.app.close();
      await demarrer();
    }
  });
});
