import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { attendre, compteConnecte, connecter, demarrerApp, viderLaBase, type ClientDeCommandes } from './app-de-test.js';

// 11.1 à 11.6 : les commandes en temps réel, avec de vrais clients socket.io.
describe('Temps réel (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let url: string;
  const ouverts: ClientDeCommandes[] = [];
  const ouvrir = async (jeton: string, options?: { reconnexion?: boolean }) => {
    const client = await connecter(url, jeton, options);
    ouverts.push(client);
    return client;
  };

  // Alice (vendeur 1, variante 1) et Bob (vendeur 2, variante 2) ; Carla et Dan achètent.
  let alice: { accessToken: string };
  let bob: { accessToken: string };
  let carla: { accessToken: string; bearer: string };
  let dan: { accessToken: string };
  let admin: { bearer: string };

  beforeAll(async () => {
    ({ app, dataSource, http, url } = await demarrerApp());
  });

  beforeEach(async () => {
    await viderLaBase(dataSource);
    alice = await compteConnecte(http, dataSource, 'alice@exemple.fr', 'vendeur');
    bob = await compteConnecte(http, dataSource, 'bob@exemple.fr', 'vendeur');
    carla = await compteConnecte(http, dataSource, 'carla@exemple.fr');
    dan = await compteConnecte(http, dataSource, 'dan@exemple.fr');
    admin = await compteConnecte(http, dataSource, 'chef@exemple.fr', 'admin');
    for (const [vendeur, nom, produit] of [[alice, 'Chez Alice', 'Table'], [bob, 'Chez Bob', 'Lampe']] as const) {
      const bearer = `Bearer ${vendeur.accessToken}`;
      const v = await http().post('/api/vendeurs').set('Authorization', bearer).send({ nom }).expect(201);
      const p = await http().post(`/api/vendeurs/${v.body.data.id}/produits`).set('Authorization', bearer).send({ nom: produit, prix: 30, categorie: 'mobilier' }).expect(201);
      await http().post(`/api/produits/${p.body.data.id}/variantes`).set('Authorization', bearer).send({ nom: 'Rouge' }).expect(201);
    }
  });

  afterEach(() => {
    for (const client of ouverts.splice(0)) client.close();
  });

  afterAll(async () => {
    await app.close();
  });

  const commander = async (lignes: { varianteId: number; quantite: number }[]) =>
    (await http().post('/api/commandes').set('Authorization', carla.bearer).send({ lignes }).expect(201)).body.data.id as number;

  it('refuse un client sans jeton, ou avec un jeton falsifié', async () => {
    await expect(connecter(url)).rejects.toThrow('Jeton manquant');
    await expect(connecter(url, 'abc.def.ghi')).rejects.toThrow('Jeton invalide ou expiré');
  });

  it('valide la demande, et répond dans l\'accusé en cas d\'erreur', async () => {
    const client = await ouvrir(alice.accessToken);
    expect(await client.emitWithAck('vendeur:suivre', { vendeurId: 'abc' as never })).toEqual({ ok: false, erreur: ['vendeurId must be an integer number'] });
    expect(await client.emitWithAck('vendeur:suivre', { vendeurId: 99 })).toEqual({ ok: false, erreur: 'Vendeur 99 introuvable' });
    expect(await client.emitWithAck('vendeur:suivre', { vendeurId: 2 })).toEqual({ ok: false, erreur: 'Ce vendeur ne t\'appartient pas' });
  });

  it('une commande à deux vendeurs : chacun ne reçoit que ses lignes', async () => {
    const [clientAlice, clientBob] = [await ouvrir(alice.accessToken), await ouvrir(bob.accessToken)];
    await clientAlice.emitWithAck('vendeur:suivre', { vendeurId: 1 });
    await clientBob.emitWithAck('vendeur:suivre', { vendeurId: 2 });
    const [pourAlice, pourBob] = [attendre(clientAlice, 'commande:creee'), attendre(clientBob, 'commande:creee')];
    await commander([{ varianteId: 1, quantite: 1 }, { varianteId: 2, quantite: 3 }]);
    expect(await pourAlice).toEqual({ commandeId: 1, lignes: [{ produit: 'Table', quantite: 1 }] });
    expect(await pourBob).toEqual({ commandeId: 1, lignes: [{ produit: 'Lampe', quantite: 3 }] });
  });

  it('un autre compte ne suit pas le vendeur, et ne reçoit rien (vérifié par un aller-retour)', async () => {
    const [clientAlice, intrus] = [await ouvrir(alice.accessToken), await ouvrir(bob.accessToken)];
    await clientAlice.emitWithAck('vendeur:suivre', { vendeurId: 1 });
    await intrus.emitWithAck('vendeur:suivre', { vendeurId: 1 });
    const recusParIntrus: unknown[] = [];
    intrus.onAny((evenement, contenu) => recusParIntrus.push([evenement, contenu]));
    const recu = attendre(clientAlice, 'commande:creee');
    await commander([{ varianteId: 1, quantite: 1 }]);
    await recu;
    // socket.io livre dans l'ordre : la réponse à cet aller-retour part après le message d'Alice.
    await intrus.emitWithAck('vendeur:suivre', { vendeurId: 2 });
    expect(recusParIntrus).toEqual([]);
  });

  it('l\'acheteur, et lui seul, apprend l\'expédition de sa commande', async () => {
    const [clientCarla, clientDan] = [await ouvrir(carla.accessToken), await ouvrir(dan.accessToken)];
    const recusParDan: unknown[] = [];
    clientDan.onAny((evenement, contenu) => recusParDan.push([evenement, contenu]));
    const id = await commander([{ varianteId: 1, quantite: 1 }]);
    await dataSource.query('UPDATE commandes SET statut = \'payee\' WHERE id = $1', [id]);
    const statut = attendre(clientCarla, 'commande:statut');
    await http().post(`/api/commandes/${id}/expedier`).set('Authorization', admin.bearer).expect(200);
    expect(await statut).toEqual({ commandeId: id, statut: 'expediee' });
    await clientDan.emitWithAck('vendeur:suivre', { vendeurId: 1 });
    expect(recusParDan).toEqual([]);
  });

  it('rattrape les commandes manquées après une déconnexion', async () => {
    const client = await ouvrir(alice.accessToken);
    await client.emitWithAck('vendeur:suivre', { vendeurId: 1 });
    client.disconnect();
    await commander([{ varianteId: 1, quantite: 2 }, { varianteId: 2, quantite: 1 }]);
    client.connect();
    await new Promise((resolve) => client.once('connect', () => resolve(null)));
    expect(await client.emitWithAck('vendeur:suivre', { vendeurId: 1 })).toEqual({ ok: true, donnees: [{ commandeId: 1, lignes: [{ produit: 'Table', quantite: 2 }] }] });
  });

  it('après une vraie coupure, la salle ne revient qu\'avec vendeur:suivre', async () => {
    const client = await ouvrir(alice.accessToken, { reconnexion: true });
    await client.emitWithAck('vendeur:suivre', { vendeurId: 1 });
    const reconnecte = new Promise((resolve) => client.io.once('reconnect', resolve));
    client.io.engine.close();
    await reconnecte;
    const enDirect: unknown[] = [];
    client.on('commande:creee', (c) => enDirect.push(c));
    await commander([{ varianteId: 1, quantite: 1 }]);
    const ack = await client.emitWithAck('vendeur:suivre', { vendeurId: 1 });
    expect(enDirect).toEqual([]);
    expect(ack).toEqual({ ok: true, donnees: [{ commandeId: 1, lignes: [{ produit: 'Table', quantite: 1 }] }] });
    const suivante = attendre(client, 'commande:creee');
    await commander([{ varianteId: 1, quantite: 1 }]);
    expect((await suivante).commandeId).toBe(2);
  });
});
