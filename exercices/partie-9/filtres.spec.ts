import { boutique, compteConnecte, creerProduit, lancerP9, messageDe, page, type AppP9, type CompteConnecte } from './outils.js';

// 9.10 : les filtres de GET /v2/api/produits ; 9.11 : le tri par liste blanche. Le jeu de données est posé
// par le test. À faire toi-même : TES tests, l'essai `id DESC, (SELECT 1/0)` dans une branche jetable et
// le test qui échoue sans le `if` du départage (9.11).
//
// `prixMin` et `prixMax` sont « en centimes » dans la consigne, alors que la marketplace range ses prix en
// euros depuis la partie 5 (`numeric`, 30.00) : les deux lectures sont acceptées (voir le README).

type Produit = { id: number; nom: string; prix: string | number; categorie: string };

// Des noms en minuscules sans espace ni tiret : l'ordre alphabétique est le même pour PostgreSQL et pour JS.
const JEU = [
  { cle: 'a', nom: 'abricot', prix: 8, categorie: 'mobilier' },
  { cle: 'b', nom: 'banane', prix: 12, categorie: 'mobilier' },
  { cle: 'c', nom: 'cerise', prix: 20, categorie: 'mobilier' },
  { cle: 'd', nom: 'datte', prix: 1500, categorie: 'mobilier' },
  { cle: 'e', nom: 'endive', prix: 2500, categorie: 'mobilier' },
  { cle: 'f', nom: 'figue', prix: 12, categorie: 'mobilier', actif: false },
  { cle: 'g', nom: 'goyave', prix: 12, categorie: 'papeterie' },
  { cle: 'h', nom: 'haricot', prix: 1500, categorie: 'papeterie' },
  { cle: 'i', nom: 'igname', prix: 15, categorie: 'informatique' },
] as const;
const ACTIFS = JEU.filter((p) => !('actif' in p)).length;

describe('Partie 9 · Filtrer et trier (exercices 9.10, 9.11)', () => {
  let lancee: AppP9;
  let compte: CompteConnecte;
  let vendeur: number;
  const id: Record<string, number> = {};

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerP9();
      compte = await compteConnecte(lancee);
      vendeur = await boutique(lancee);
      for (const { cle, ...produit } of JEU) id[cle] = await creerProduit(lancee, vendeur, produit);
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  const get = (qs: string) => lancee.http().get(`/v2/api/produits?${qs}`).set('Authorization', compte.bearer);
  const lister = async (qs: string) => page<Produit>(await get(qs), `GET /v2/api/produits?${qs}`);
  const cles = (liste: Produit[]) => liste.map((p) => Object.keys(id).find((c) => id[c] === Number(p.id)) ?? `?${p.id}`).sort();

  describe('9.10 · filtrer le catalogue', () => {
    it('seulement les produits actifs', async () => {
      const p = await lister('limite=100');
      expect(cles(p.donnees), 'le produit inactif (`actif: false`) n\'apparaît pas').not.toContain('f');
      expect(p.meta.total, 'le total ne compte que les produits actifs').toBe(ACTIFS);
    });

    it('filtre par catégorie, et le total suit le filtre', async () => {
      const p = await lister('categorie=papeterie&limite=1');
      expect(p.donnees).toHaveLength(1);
      expect(p.meta, 'le `total` compte les résultats FILTRÉS (le `where` s\'applique aussi au comptage de `getManyAndCount`)').toEqual({ page: 1, limite: 1, total: 2, totalPages: 2 });
      const mobilier = await lister('categorie=mobilier&limite=100');
      expect(cles(mobilier.donnees), 'catégorie mobilier, actifs seulement').toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(mobilier.meta.total).toBe(5);
    });

    it('un filtre combiné : catégorie et fourchette de prix', async () => {
      const p = await lister('categorie=mobilier&prixMin=1000&prixMax=2000&limite=100');
      // En centimes (la consigne) : de 10 € à 20 € ; en euros (la colonne prix) : de 1000 € à 2000 €.
      const lectures = { 'en centimes (10 € à 20 €)': ['b', 'c'], 'en euros (1000 € à 2000 €)': ['d'] };
      const trouves = cles(p.donnees);
      expect(Object.values(lectures), `?categorie=mobilier&prixMin=1000&prixMax=2000 : bornes incluses, produits actifs de la catégorie seulement (reçu : ${trouves.join(', ') || 'rien'} ; attendu ${Object.entries(lectures).map(([l, c]) => `${c.join(', ')} ${l}`).join(', ou ')})`).toContainEqual(trouves);
      expect(p.meta.total, 'le total suit les filtres').toBe(trouves.length);
    });

    it('prixMin seul, prixMax seul', async () => {
      const min = cles((await lister('prixMin=1500&limite=100')).donnees);
      expect([['c', 'd', 'e', 'h', 'i'], ['d', 'e', 'h']], `?prixMin=1500 (reçu : ${min.join(', ')})`).toContainEqual(min);
      const max = cles((await lister('prixMax=1200&limite=100')).donnees);
      expect([['a', 'b', 'g'], ['a', 'b', 'c', 'g', 'i']], `?prixMax=1200 (reçu : ${max.join(', ')})`).toContainEqual(max);
    });

    it('prixMin supérieur à prixMax : 400, avec un message explicite', async () => {
      const r = await get('prixMin=5000&prixMax=1000');
      expect(r.status, 'une fourchette impossible est refusée, pas renvoyée vide').toBe(400);
      const message = messageDe(r.body);
      expect(message, `le message nomme les deux paramètres (« prixMin ne peut pas dépasser prixMax ») ; reçu : ${message}`).toMatch(/prixMin/);
      expect(message).toMatch(/prixMax/);
    });

    it.each(['prixMin=-1', 'prixMax=2.5', 'prixMin=abc'])('refuse ?%s avec 400 (des entiers positifs)', async (qs) => {
      const r = await get(qs);
      expect(r.status, `?${qs} : \`@Type(() => Number)\`, \`@IsInt()\` et \`@Min(0)\` (réponse : ${JSON.stringify(r.body).slice(0, 300)})`).toBe(400);
    });
  });

  describe('9.11 · trier avec une liste blanche', () => {
    const prix = (liste: Produit[]) => liste.map((p) => Number(p.prix));
    const ids = (liste: Produit[]) => liste.map((p) => Number(p.id));

    it('?tri=prix&ordre=desc : du plus cher au moins cher', async () => {
      const p = await lister('tri=prix&ordre=desc&limite=100');
      expect(p.donnees).toHaveLength(ACTIFS);
      expect(prix(p.donnees)).toEqual([...prix(p.donnees)].sort((a, b) => b - a));
    });

    it('?tri=prix&ordre=asc : du moins cher au plus cher', async () => {
      expect(prix((await lister('tri=prix&ordre=asc&limite=100')).donnees)).toEqual([8, 12, 12, 15, 20, 1500, 1500, 2500]);
    });

    it('?tri=nom&ordre=asc : par ordre alphabétique', async () => {
      const noms = (await lister('tri=nom&ordre=asc&limite=100')).donnees.map((p) => p.nom);
      expect(noms).toEqual([...noms].sort());
      expect(noms[0]).toBe('abricot');
    });

    it('?tri=id&ordre=desc est bien décroissant (le piège du départage)', async () => {
      const liste = ids((await lister('tri=id&ordre=desc&limite=100')).donnees);
      expect(liste, 'la liste sort à l\'envers : un départage `addOrderBy(\'…id\', \'ASC\')` ajouté après a écrasé le `id DESC` demandé. N\'ajoute le départage que si `tri !== \'id\'`').toEqual([...liste].sort((a, b) => b - a));
      expect(ids((await lister('tri=id&ordre=asc&limite=100')).donnees)).toEqual([...liste].reverse());
    });

    it('à prix égal, un ordre stable : les pages ne se recouvrent pas', async () => {
      const vus: number[] = [];
      for (let n = 1; n <= ACTIFS; n++) vus.push(...ids((await lister(`tri=prix&ordre=asc&limite=1&page=${n}`)).donnees));
      expect(new Set(vus).size, 'deux produits à 12 € : sans départage par identifiant, leur ordre n\'est pas garanti d\'une page à l\'autre').toBe(ACTIFS);
    });

    it.each(['tri=motdepasse', 'tri=vendeur', 'ordre=up', `tri=${encodeURIComponent('id DESC, (SELECT 1/0)')}`])('refuse ?%s avec 400', async (qs) => {
      const r = await get(qs);
      expect(r.status, `?${decodeURIComponent(qs)} : \`@IsIn(Object.keys(COLONNES_DE_TRI))\` refuse toute clé hors de la liste blanche, AVANT le service (un 500, c'est une requête SQL déjà partie) ; réponse : ${JSON.stringify(r.body).slice(0, 300)}`).toBe(400);
    });
  });

  // La recherche (section d du cours) n'est pas demandée par les exercices : ces tests ne s'appliquent que
  // si GET /v2/api/produits accepte `recherche`. Ils ajoutent des produits : en dernier.
  describe('bonus · la recherche échappe % et _', () => {
    let accepte = false;
    beforeAll(async () => {
      if (echec) return;
      const r = await get('recherche=zzz');
      accepte = r.status === 200;
      if (!accepte) return;
      for (const nom of ['Hameau 100%', 'Hameau 100x', 'Lune_Rousse', 'LuneXRousse']) await creerProduit(lancee, vendeur, { nom });
    });

    it('?recherche=100% ne trouve que « Hameau 100% »', async ({ skip }) => {
      if (!accepte) skip();
      const noms = (await lister(`recherche=${encodeURIComponent('100%')}&limite=100`)).donnees.map((p) => p.nom);
      expect(noms, 'dans ILIKE, `%` veut dire « n\'importe quoi » : échappe-le (`echapperLike`) et ajoute `ESCAPE \'\\\'`').toEqual(['Hameau 100%']);
    });

    it('?recherche=Lune_ ne trouve que « Lune_Rousse »', async ({ skip }) => {
      if (!accepte) skip();
      const noms = (await lister('recherche=Lune_&limite=100')).donnees.map((p) => p.nom);
      expect(noms, 'dans ILIKE, `_` veut dire « un caractère » : échappe-le aussi').toEqual(['Lune_Rousse']);
    });
  });
});
