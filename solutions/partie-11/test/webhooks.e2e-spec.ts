import { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { CommandesService } from '../src/commandes/commandes.service.js';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// Bonus 11.13 à 11.15 : le webhook de paiement, signé (hors ligne, sans compte Stripe) et idempotent.
describe('Webhooks (e2e)', () => {
  const SECRET = process.env.WEBHOOK_SECRET!;
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
  });

  // Une commande en attente (la commande 1), passée par Carla.
  beforeEach(async () => {
    await viderLaBase(dataSource);
    const { bearer: alice } = await compteConnecte(http, dataSource, 'alice@exemple.fr', 'vendeur');
    const { bearer: carla } = await compteConnecte(http, dataSource, 'carla@exemple.fr');
    const v = await http().post('/api/vendeurs').set('Authorization', alice).send({ nom: 'Chez Alice' }).expect(201);
    const p = await http().post(`/api/vendeurs/${v.body.data.id}/produits`).set('Authorization', alice).send({ nom: 'Table', prix: 30, categorie: 'mobilier' }).expect(201);
    const variante = await http().post(`/api/produits/${p.body.data.id}/variantes`).set('Authorization', alice).send({ nom: 'Rouge' }).expect(201);
    await http().post('/api/commandes').set('Authorization', carla).send({ lignes: [{ varianteId: variante.body.data.id, quantite: 1 }] }).expect(201);
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await app.close();
  });

  const paiement = (id: string, commandeId = 1) => JSON.stringify({ id, type: 'paiement.reussi', data: { object: { commandeId } } });
  const livrer = (corps: string, signature = Stripe.webhooks.generateTestHeaderString({ payload: corps, secret: SECRET })) =>
    http().post('/api/webhooks/paiements').set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(corps);
  const statut = async () => (await dataSource.query('SELECT statut FROM commandes WHERE id = 1'))[0].statut as string;
  const recus = async () => (await dataSource.query('SELECT count(*)::int AS total FROM evenements_recus'))[0].total as number;

  it('accepte un paiement signé, même écrit avec des espaces (le corps brut)', async () => {
    const corps = JSON.stringify(JSON.parse(paiement('evt_1')), null, 2);
    const reponse = await livrer(corps).expect(200);
    expect(reponse.body.data).toEqual({ doublon: false });
    expect(await statut()).toBe('payee');
  });

  it('refuse une signature fausse, absente, trop vieille, ou un corps modifié', async () => {
    const corps = paiement('evt_1');
    const faux = await livrer(corps, 't=123,v1=abc').expect(400);
    expect(faux.body.message).toContain('No signatures found matching the expected signature');
    const absente = await http().post('/api/webhooks/paiements').set('Content-Type', 'application/json').send(corps).expect(400);
    expect(absente.body.message).toBe('Signature refusée : No stripe-signature header value was provided.');
    const vieille = Stripe.webhooks.generateTestHeaderString({ payload: corps, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 600 });
    expect((await livrer(corps, vieille).expect(400)).body.message).toBe('Signature refusée : Timestamp outside the tolerance zone');
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: corps, secret: SECRET });
    await livrer(paiement('evt_1', 2), signature).expect(400);
    expect(await statut()).toBe('en_attente');
  });

  it('un doublon répond 200, sans rien refaire ; trois livraisons simultanées ne paient qu\'une fois', async () => {
    await livrer(paiement('evt_1')).expect(200);
    expect((await livrer(paiement('evt_1')).expect(200)).body.data).toEqual({ doublon: true });
    await dataSource.query('UPDATE commandes SET statut = \'en_attente\'');
    const reponses = await Promise.all([livrer(paiement('evt_2')), livrer(paiement('evt_2')), livrer(paiement('evt_2'))]);
    expect(reponses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(reponses.filter((r) => r.body.data.doublon === false)).toHaveLength(1);
    expect(await recus()).toBe(2);
  });

  it('après une panne pendant le traitement, la livraison suivante est traitée', async () => {
    vi.spyOn(app.get(CommandesService), 'marquerPayee').mockRejectedValueOnce(new Error('panne'));
    await livrer(paiement('evt_1')).expect(500);
    expect(await statut()).toBe('en_attente');
    expect(await recus()).toBe(0);
    await livrer(paiement('evt_1')).expect(200);
    expect(await statut()).toBe('payee');
  });

  it('une commande inconnue : 200, l\'événement est noté et ignoré (un 4xx ferait réessayer le prestataire pour rien)', async () => {
    expect((await livrer(paiement('evt_1', 999)).expect(200)).body.data).toEqual({ doublon: false });
    expect(await recus()).toBe(1);
  });
});
