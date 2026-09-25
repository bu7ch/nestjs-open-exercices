import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { firstValueFrom, map, of, throwError, timer } from 'rxjs';
import type { AppAvecBase } from '../partie-5/outils.js';
import { cartographier, champsInternes, compteConnecte, creerBoutique, creerProduit, donnees, exportNomme, lancerAvecAuth, type CompteConnecte, type Envoi } from './outils.js';

// 8.11 : un interceptor masque le champ interne de Produit ; 8.12 : DelaiMaximalInterceptor ; 8.13 : un
// interceptor global enveloppe les réponses dans { data }. À faire toi-même : la route de démonstration
// du 8.12 (son chemin est libre) et ce que tu observes ; les tests qui tombent au 8.13, et pourquoi.
// Tes tests unitaires du 8.11 sont jugés dans tes-tests.spec.ts.

const INDICE_CHAMP = 'Ajoute à l\'entité Produit un champ interne, par exemple `@Column({ type: \'numeric\', precision: 10, scale: 2, nullable: true }) prixAchat` (exercice 8.11).';

/** Une valeur reconnaissable pour une colonne de ce type (undefined : type non géré ici). */
function valeurPour(type: string): unknown {
  if (/numeric|decimal|real|double|float|money/.test(type)) return 12.5;
  if (/int/.test(type)) return 12;
  if (/char|text/.test(type)) return 'interne-8-11';
  if (/bool/.test(type)) return true;
  return undefined;
}

const visible = (produit: Record<string, unknown> | undefined, champ: string) => produit?.[champ] !== undefined && produit?.[champ] !== null;

describe('Partie 8 · Les interceptors (exercices 8.11 à 8.13)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];

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

  describe('8.11 · masquer le champ interne de Produit', () => {
    let alice: CompteConnecte;
    let bob: CompteConnecte;
    let acheteur: CompteConnecte;
    let admin: CompteConnecte;
    let produitAlice: number;
    let produitBob: number;
    /** Le champ interne : celui que l'application cache à un autre vendeur. */
    let champ: string;

    let echecPreparation: unknown;
    beforeAll(async () => {
      if (echec) return;
      try {
        const candidats = champsInternes(lancee).filter((c) => valeurPour(c.type) !== undefined);
        if (candidats.length === 0) throw new Error(`L'entité Produit n'a pas de champ interne (aucune colonne en plus de id, nom, prix, categorie, actif). ${INDICE_CHAMP}`);
        const valeurs = Object.fromEntries(candidats.map((c) => [c.nom, valeurPour(c.type)]));
        [alice, bob, acheteur, admin] = [await compteConnecte(lancee, 'vendeur'), await compteConnecte(lancee, 'vendeur'), await compteConnecte(lancee), await compteConnecte(lancee, 'admin')];
        produitAlice = await creerProduit(lancee, await creerBoutique(lancee, alice.id, 'Chez Alice'), { nom: 'Lampe d\'Alice', ...valeurs });
        produitBob = await creerProduit(lancee, await creerBoutique(lancee, bob.id, 'Chez Bob'), { nom: 'Lampe de Bob', ...valeurs });
        const vuParBob = donnees<Record<string, unknown>>((await http().get(`/api/produits/${produitAlice}`).set('Authorization', bob.bearer)).body);
        champ = candidats.find((c) => !visible(vuParBob, c.nom))?.nom ?? candidats[0]!.nom;
      } catch (erreur) {
        echecPreparation = erreur;
      }
    });
    beforeEach(() => {
      if (echecPreparation) throw echecPreparation;
    });

    const lire = async (id: number, compte: CompteConnecte) => {
      const r = await http().get(`/api/produits/${id}`).set('Authorization', compte.bearer);
      expect(r.status, `GET /api/produits/${id} : ${JSON.stringify(r.body)}`).toBe(200);
      return donnees<Record<string, unknown>>(r.body);
    };
    const lister = async (compte: CompteConnecte) => {
      const r = await http().get('/api/produits?limite=100').set('Authorization', compte.bearer);
      expect(r.status, `GET /api/produits : ${JSON.stringify(r.body)}`).toBe(200);
      const liste = donnees<Record<string, unknown>[]>(r.body);
      const trouver = (id: number) => {
        const produit = liste.find((p) => Number(p.id) === id);
        if (!produit) throw new Error(`GET /api/produits ne renvoie plus le produit ${id} (l'interceptor doit transformer chaque produit de la liste, pas la vider). Réponse : ${JSON.stringify(r.body).slice(0, 400)}`);
        return produit;
      };
      return trouver;
    };

    it('GET /api/produits/:id : un autre vendeur ne voit pas le champ interne', async () => {
      const produit = await lire(produitAlice, bob);
      expect(visible(produit, champ), `le champ \`${champ}\` du produit d'Alice est visible par Bob : écris un interceptor qui le retire (\`undefined\`) pour qui n'est ni le propriétaire ni un admin, et applique-le avec \`@UseInterceptors(...)\``).toBe(false);
      expect(produit.nom, 'le reste du produit est toujours là').toBe('Lampe d\'Alice');
    });

    it('GET /api/produits/:id : le propriétaire et un admin le voient', async () => {
      expect(visible(await lire(produitAlice, alice), champ), `le propriétaire (compte du vendeur du produit, 7.14) voit \`${champ}\``).toBe(true);
      expect(visible(await lire(produitAlice, admin), champ), `un admin voit \`${champ}\``).toBe(true);
    });

    it('GET /api/produits/:id : un acheteur ne le voit pas', async () => {
      expect(visible(await lire(produitAlice, acheteur), champ)).toBe(false);
    });

    it('GET /api/produits (la liste) : chacun ne voit que le champ de SES produits', async () => {
      const pourAlice = await lister(alice);
      expect(visible(pourAlice(produitAlice), champ), 'dans la liste, Alice voit le champ de son produit : l\'interceptor reçoit un TABLEAU').toBe(true);
      expect(visible(pourAlice(produitBob), champ), 'dans la liste, Alice ne voit pas le champ du produit de Bob').toBe(false);
      const pourBob = await lister(bob);
      expect(visible(pourBob(produitBob), champ)).toBe(true);
      expect(visible(pourBob(produitAlice), champ)).toBe(false);
      const pourAcheteur = await lister(acheteur);
      expect([visible(pourAcheteur(produitAlice), champ), visible(pourAcheteur(produitBob), champ)], 'un acheteur ne voit aucun champ interne').toEqual([false, false]);
      const pourAdmin = await lister(admin);
      expect([visible(pourAdmin(produitAlice), champ), visible(pourAdmin(produitBob), champ)], 'un admin les voit tous').toEqual([true, true]);
    });
  });

  describe('8.13 · envelopper toutes les réponses', () => {
    let compte: CompteConnecte;
    beforeAll(async () => {
      if (echec) return;
      compte = await compteConnecte(lancee, 'vendeur');
    });

    it('un interceptor est déclaré avec APP_INTERCEPTOR', async () => {
      const { globaux } = await cartographier();
      expect(globaux.interceptors.map((c) => c.name), 'déclare ton interceptor dans un module : `{ provide: APP_INTERCEPTOR, useClass: ... }` (pas `app.useGlobalInterceptors`, absent des tests)').not.toHaveLength(0);
    });

    it('chaque réponse réussie devient { data: … }', async () => {
      const essais: [string, Envoi, (data: unknown) => boolean][] = [
        ['GET /api/produits', () => http().get('/api/produits').set('Authorization', compte.bearer), (d) => Array.isArray(d)],
        ['GET /api/auth/moi', () => http().get('/api/auth/moi').set('Authorization', compte.bearer), (d) => (d as { email?: string })?.email === compte.email],
        ['POST /api/vendeurs', () => http().post('/api/vendeurs').set('Authorization', compte.bearer).send({ nom: 'Atelier 8.13' }), (d) => (d as { nom?: string })?.nom === 'Atelier 8.13'],
      ];
      for (const [nom, requete, attendu] of essais) {
        const r = await requete();
        expect(r.status, `${nom} : ${JSON.stringify(r.body)}`).toBeLessThan(300);
        expect(Object.keys(r.body ?? {}), `${nom} doit répondre \`{ "data": … }\` : \`map((data) => ({ data }))\` dans un interceptor global`).toEqual(['data']);
        expect(attendu(r.body.data), `${nom} : la réponse d'origine, dans data`).toBe(true);
      }
    });

    it('une route qui répond 204 reste sans contenu', async () => {
      const cree = await http().post('/api/vendeurs').set('Authorization', compte.bearer).send({ nom: 'À supprimer' });
      const id = donnees<{ id: number }>(cree.body)?.id;
      const r = await http().delete(`/api/vendeurs/${id}`).set('Authorization', compte.bearer);
      expect(r.status, 'DELETE /api/vendeurs/:id répond toujours 204').toBe(204);
      expect(r.text, 'une réponse 204 n\'a pas de corps').toBe('');
    });
  });
});

// Sans application : DelaiMaximalInterceptor est appelé directement, comme dans le cours.
describe('Partie 8 · Un temps maximal (exercice 8.12)', () => {
  type Classe = new (delaiEnMs: number) => NestInterceptor;
  let Delai: Classe;
  const contexte = {
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    getHandler: () => () => undefined,
    getClass: () => Object,
    getType: () => 'http',
  } as unknown as ExecutionContext;

  beforeAll(async () => {
    Delai = exportNomme(await cartographier(), 'DelaiMaximalInterceptor')?.valeur as Classe;
  });
  const exiger = () => {
    if (typeof Delai !== 'function') throw new Error('Aucun fichier de src/ n\'exporte la classe `DelaiMaximalInterceptor` (exercice 8.12).');
    return new Delai(50);
  };
  const flux = (interceptor: NestInterceptor, handle: CallHandler['handle']) => firstValueFrom(interceptor.intercept(contexte, { handle }) as never);

  it('laisse passer une réponse plus rapide que le délai', async () => {
    await expect(flux(exiger(), () => of('rapide'))).resolves.toBe('rapide');
  });

  it('au-delà du délai : une RequestTimeoutException (408), sans attendre la fin du handler', async () => {
    const debut = performance.now();
    const erreur = await flux(exiger(), () => timer(400).pipe(map(() => 'lent'))).catch((e: unknown) => e);
    expect((erreur as { getStatus?: () => number })?.getStatus?.(), '`timeout(this.delaiEnMs)` puis `catchError` : une TimeoutError devient `new RequestTimeoutException(...)` (statut 408)').toBe(408);
    expect(performance.now() - debut, 'le délai est celui passé au constructeur (50 ms ici)').toBeLessThan(350);
  });

  it('les autres erreurs passent telles quelles', async () => {
    const panne = new Error('panne');
    await expect(flux(exiger(), () => throwError(() => panne)), 'catchError ne transforme que la TimeoutError : `erreur instanceof TimeoutError ? ... : erreur`').rejects.toBe(panne);
  });
});
