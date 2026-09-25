import { boutique, compteConnecte, creerProduit, donnees, lancerP9, page, type AppP9, type CompteConnecte } from './outils.js';

// 9.7 : la pagination par pages de GET /v2/api/produits ; 9.8 : le piège de `@Type(() => Number)` ;
// 9.9 : la pagination par curseur. Le jeu de données : 25 produits actifs, posés par le test.
// À faire toi-même : TES tests (9.7, 9.9), le message exact sans `@Type` (9.8).

const TOTAL = 25;
type Produit = { id: number; nom?: string };

describe('Partie 9 · Paginer (exercices 9.7 à 9.9)', () => {
  let lancee: AppP9;
  let compte: CompteConnecte;
  let vendeur: number;
  let ids: number[] = [];

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerP9();
      compte = await compteConnecte(lancee);
      vendeur = await boutique(lancee);
      ids = [];
      for (let i = 1; i <= TOTAL; i++) ids.push(await creerProduit(lancee, vendeur, { nom: `Produit ${String(i).padStart(2, '0')}` }));
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  const get = (chemin: string) => lancee.http().get(chemin).set('Authorization', compte.bearer);
  const lister = async (qs: string) => page<Produit>(await get(`/v2/api/produits${qs ? `?${qs}` : ''}`), `GET /v2/api/produits?${qs}`);

  describe('9.7 · paginer le catalogue', () => {
    it('page 3 de 10 : les 5 derniers, avec le bon meta', async () => {
      const p = await lister('page=3&limite=10');
      expect(p.donnees, 'la page 3 saute `(page - 1) × limite` = 20 produits sur 25 (`skip` et `take`)').toHaveLength(5);
      expect(p.meta, '`creerPage(donnees, total, page, limite)` : totalPages = Math.ceil(total / limite)').toEqual({ page: 3, limite: 10, total: TOTAL, totalPages: 3 });
    });

    it('les trois pages couvrent tout le catalogue, sans doublon ni oubli', async () => {
      const vus: number[] = [];
      for (const n of [1, 2, 3]) vus.push(...(await lister(`page=${n}&limite=10`)).donnees.map((p) => Number(p.id)));
      expect(new Set(vus).size, 'un tri stable (`order`, avec l\'identifiant en départage) : deux pages ne se recouvrent jamais').toBe(TOTAL);
      expect([...vus].sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    });

    it('sans paramètre : la première page, avec la taille par défaut', async () => {
      const p = await lister('');
      expect(p.meta.page, 'valeur par défaut : `page: number = 1`').toBe(1);
      expect(p.meta.limite, 'valeur par défaut de `limite` (20 dans le cours), au plus 100').toBeGreaterThanOrEqual(1);
      expect(p.meta.limite).toBeLessThanOrEqual(100);
      expect(p.donnees).toHaveLength(Math.min(p.meta.limite, TOTAL));
      expect(p.meta.total).toBe(TOTAL);
    });

    it('une page au-delà de la fin : 200 et une liste vide, avec le bon total', async () => {
      const p = await lister('page=99');
      expect(p.donnees, 'une page vide n\'est pas une erreur').toEqual([]);
      expect(p.meta.total).toBe(TOTAL);
      expect(p.meta.page).toBe(99);
    });

    it.each(['page=0', 'page=abc', 'limite=0', 'limite=101', 'limite=2.5', 'page=-1'])('refuse ?%s avec 400', async (qs) => {
      const r = await get(`/v2/api/produits?${qs}`);
      const indice = qs === 'limite=101' ? 'un plafond : `@Max(100)` sur limite' : '`@IsInt()` et `@Min(1)` dans PaginationDto, et `@Query() pagination: PaginationDto`';
      expect(r.status, `?${qs} : ${indice} (réponse : ${JSON.stringify(r.body).slice(0, 300)})`).toBe(400);
    });
  });

  describe('9.8 · le piège du @Type', () => {
    it('?page=2&limite=10 est accepté, et arrive en NOMBRES', async () => {
      const r = await get('/v2/api/produits?page=2&limite=10');
      expect(r.status, `\`?page=2\` arrive comme le texte "2" : sans \`@Type(() => Number)\`, \`@IsInt()\` le refuse (réponse : ${JSON.stringify(r.body).slice(0, 300)})`).toBe(200);
      const p = page<Produit>(r, 'GET /v2/api/produits?page=2&limite=10');
      expect(p.meta.page, 'meta.page est le NOMBRE 2 (pas le texte "2")').toBe(2);
      expect(p.meta.limite).toBe(10);
      expect(p.donnees).toHaveLength(10);
    });
  });

  describe('9.9 · le curseur', () => {
    const curseur = async (apres: number, limite: number) => {
      const r = await get(`/v2/api/produits/curseur?apres=${apres}&limite=${limite}`);
      const contenu = donnees<{ donnees?: Produit[]; curseurSuivant?: number | null }>(r.body);
      if (r.status !== 200 || !Array.isArray(contenu?.donnees) || !('curseurSuivant' in (contenu ?? {}))) {
        throw new Error(
          `GET /v2/api/produits/curseur?apres=${apres}&limite=${limite} doit répondre 200 avec \`{ donnees, curseurSuivant }\` (exercice 9.9 ; déclare cette route AVANT \`:id\`, sinon « curseur » est pris pour un identifiant). Réponse ${r.status} : ${JSON.stringify(r.body).slice(0, 300)}`,
        );
      }
      return contenu as { donnees: Produit[]; curseurSuivant: number | null };
    };

    it('parcourt les 25 produits par 10, sans doublon ni oubli, et finit par null', async () => {
      const vus: number[] = [];
      let apres = 0;
      let tours = 0;
      for (; tours < 10; tours++) {
        const suite = await curseur(apres, 10);
        vus.push(...suite.donnees.map((p) => Number(p.id)));
        if (suite.curseurSuivant === null) break;
        expect(suite.curseurSuivant, '`curseurSuivant` : l\'identifiant du dernier produit rendu').toBe(Number(suite.donnees.at(-1)?.id));
        apres = suite.curseurSuivant;
      }
      expect(vus.length, `aucun doublon : \`id > apres\` (MoreThan), pas \`>=\` (vus : ${vus.join(', ')})`).toBe(new Set(vus).size);
      expect([...vus].sort((a, b) => a - b), 'tous les produits, une fois chacun').toEqual([...ids].sort((a, b) => a - b));
      expect(tours + 1, 'trois appels pour 25 produits par 10 ; le troisième renvoie `curseurSuivant: null` (demande `limite + 1` éléments pour savoir s\'il en reste)').toBe(3);
    });

    it('une page pleine qui est la dernière : curseurSuivant null', async () => {
      const suite = await curseur(0, TOTAL);
      expect(suite.donnees).toHaveLength(TOTAL);
      expect(suite.curseurSuivant, 'il ne reste rien après : `null` (sans requête de comptage : l\'élément « de trop » n\'est pas venu)').toBeNull();
    });

    it.each(['apres=-1', 'apres=abc', 'limite=0', 'limite=101'])('refuse ?%s avec 400', async (qs) => {
      const r = await get(`/v2/api/produits/curseur?${qs}`);
      expect(r.status, `?${qs} : une \`CurseurDto\` (\`apres\` entier ≥ 0, \`limite\` entre 1 et 100) (réponse : ${JSON.stringify(r.body).slice(0, 300)})`).toBe(400);
    });

    // En dernier : ce test ajoute un produit.
    it('un ajout entre deux pages numérotées fait répéter un produit ; pas avec le curseur', async () => {
      // Le glissement ne se voit que du plus récent au plus ancien : l'ordre par défaut, ou `tri=id&ordre=desc` (9.11).
      const decroissant = (liste: Produit[]) => liste.every((p, i) => i === 0 || Number(p.id) < Number(liste[i - 1]!.id));
      let qs = '';
      if (!decroissant((await lister('page=1&limite=10')).donnees)) {
        const r = await get('/v2/api/produits?page=1&limite=10&tri=id&ordre=desc');
        if (r.status !== 200 || !decroissant(page<Produit>(r, 'GET /v2/api/produits?tri=id&ordre=desc').donnees)) {
          throw new Error('Pour voir le doublon, la liste doit aller du plus récent au plus ancien : trie par `id` décroissant par défaut, ou accepte `?tri=id&ordre=desc` (exercice 9.11).');
        }
        qs = '&tri=id&ordre=desc';
      }
      const page1 = (await lister(`page=1&limite=10${qs}`)).donnees.map((p) => Number(p.id));
      const debut = await curseur(0, 10);
      const ajoute = await creerProduit(lancee, vendeur, { nom: 'Produit ajouté entre deux pages' });
      const page2 = (await lister(`page=2&limite=10${qs}`)).donnees.map((p) => Number(p.id));
      expect(page2.filter((id) => page1.includes(id)), 'avec des pages numérotées, tout glisse d\'un cran : le dernier de la page 1 revient en tête de la page 2').toHaveLength(1);

      const vus = debut.donnees.map((p) => Number(p.id));
      let apres = debut.curseurSuivant;
      for (let tour = 0; apres !== null && tour < 10; tour++) {
        const suite = await curseur(apres, 10);
        vus.push(...suite.donnees.map((p) => Number(p.id)));
        apres = suite.curseurSuivant;
      }
      expect(vus.length, 'avec le curseur, aucun doublon malgré l\'ajout').toBe(new Set(vus).size);
      expect(ids.every((id) => vus.includes(id)), 'et aucun produit oublié').toBe(true);
      expect(vus, 'le produit ajouté arrive à la fin du parcours').toContain(ajoute);
    });
  });
});
