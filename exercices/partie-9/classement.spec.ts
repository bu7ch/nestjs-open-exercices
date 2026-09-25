import { entite, relationVers } from '../partie-5/outils.js';
import { compteConnecte, creerBoutique, creerProduit, lancerP9, page, type AppP9, type CompteConnecte } from './outils.js';

// 9.12 : GET /api/classement-vendeurs, calculé par une agrégation. Le jeu de données est fait à la main :
//
//   Alpha : commande 1 (5 × 10 €) et commande 2 (2 × 10 € + 1 × 30 €)  → 2 commandes, 100 €
//   Bravo : commandes 3, 4 et 5 (1 × 20 € chacune)                     → 3 commandes,  60 €
//   Charlie : commande 6 (1 × 60 €)                                    → 1 commande,   60 €
//   Delta : une ligne de la commande 2 (1 × 15 €)                      → 1 commande,   15 €
//
// Bravo et Charlie sont à égalité de chiffre d'affaires : le critère de départage est le tien (nombre de
// commandes, identifiant…), il doit seulement donner toujours le même ordre. Les noms des champs sont
// libres, sauf le rang ; le chiffre d'affaires peut être un nombre ou un texte (`"60.00"`).
// À faire toi-même : TON test sur ce genre de jeu de données.

const ATTENDU = {
  Alpha: { commandes: 2, ca: 100 },
  Bravo: { commandes: 3, ca: 60 },
  Charlie: { commandes: 1, ca: 60 },
  Delta: { commandes: 1, ca: 15 },
} as const;
type Nom = keyof typeof ATTENDU;
type Ligne = Record<string, unknown>;

const INDICE = 'Écris `GET /api/classement-vendeurs` : une requête d\'agrégation sur les lignes de commande (`COUNT(DISTINCT …)`, `SUM(quantite * prix)`, `groupBy` par vendeur, `getRawMany`), paginée avec `PaginationDto` et `creerPage`, et un `rang` par ligne (exercice 9.12).';

/** Les valeurs d'une ligne, y compris celles d'un objet imbriqué (`vendeur: { id, nom }`). */
const valeurs = (ligne: Ligne): [string, unknown][] =>
  Object.entries(ligne).flatMap(([cle, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v as Ligne).map(([c, x]) => [`${cle}.${c}`, x] as [string, unknown]) : [[cle, v] as [string, unknown]]));

describe('Partie 9 · Le classement des vendeurs (exercice 9.12)', () => {
  let lancee: AppP9;
  let acheteur: CompteConnecte;
  const vendeurs: Record<Nom, number> = { Alpha: 0, Bravo: 0, Charlie: 0, Delta: 0 };

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      lancee = await lancerP9();
      acheteur = await compteConnecte(lancee);
      const variante = entite(lancee.ds, 'Variante', '');
      const versProduit = relationVers(variante, 'Produit', 'many-to-one')!;
      const nouvelleVariante = async (vendeur: number, prix: number) => {
        const produit = await creerProduit(lancee, vendeur, { nom: `Produit à ${prix} €`, prix });
        const v = (await lancee.ds.getRepository('Variante').save({ nom: 'Unique', [versProduit.propertyName]: { id: produit } })) as unknown as { id: number };
        return v.id;
      };
      const commander = async (lignes: [number, number][]) => {
        const r = await lancee.http().post('/api/commandes').set('Authorization', acheteur.bearer).send({ lignes: lignes.map(([varianteId, quantite]) => ({ varianteId, quantite })) });
        if (r.status !== 201) throw new Error(`POST /api/commandes a répondu ${r.status} (exercice 5.12) : ${JSON.stringify(r.body)}`);
      };
      for (const nom of Object.keys(vendeurs) as Nom[]) {
        const compte = await compteConnecte(lancee, 'vendeur');
        vendeurs[nom] = await creerBoutique(lancee, compte.id, nom);
      }
      const alpha10 = await nouvelleVariante(vendeurs.Alpha, 10);
      const alpha30 = await nouvelleVariante(vendeurs.Alpha, 30);
      const bravo20 = await nouvelleVariante(vendeurs.Bravo, 20);
      const charlie60 = await nouvelleVariante(vendeurs.Charlie, 60);
      const delta15 = await nouvelleVariante(vendeurs.Delta, 15);
      await commander([[alpha10, 5]]);
      await commander([[alpha10, 2], [alpha30, 1], [delta15, 1]]);
      await commander([[bravo20, 1]]);
      await commander([[bravo20, 1]]);
      await commander([[bravo20, 1]]);
      await commander([[charlie60, 1]]);
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  const lire = async (qs = '') => {
    const r = await lancee.http().get(`/api/classement-vendeurs${qs}`).set('Authorization', acheteur.bearer);
    if (r.status === 404) throw new Error(`GET /api/classement-vendeurs répond 404. ${INDICE}`);
    return page<Ligne>(r, `GET /api/classement-vendeurs${qs}`);
  };

  /** Le vendeur d'une ligne : par son nom ou son identifiant, sous n'importe quelle clé. */
  const vendeurDe = (ligne: Ligne): Nom => {
    for (const [, v] of valeurs(ligne)) {
      if (typeof v === 'string' && v in ATTENDU) return v as Nom;
    }
    for (const [cle, v] of valeurs(ligne)) {
      const nom = (Object.keys(vendeurs) as Nom[]).find((n) => vendeurs[n] === Number(v));
      if (nom && /id/i.test(cle)) return nom;
    }
    throw new Error(`Impossible de reconnaître le vendeur de cette ligne (ni son nom ni son identifiant) : ${JSON.stringify(ligne)}`);
  };

  /** La clé dont les valeurs valent `attendu(vendeur)` sur toutes les lignes. */
  const cleQuiVaut = (lignes: Ligne[], attendu: (n: Nom) => number): string | undefined => {
    const candidates = valeurs(lignes[0] ?? {}).map(([c]) => c);
    return candidates.find((c) => lignes.every((l) => Number(Object.fromEntries(valeurs(l))[c]) === attendu(vendeurDe(l))));
  };

  it('une ligne par vendeur, avec son nombre de commandes et son chiffre d\'affaires', async () => {
    const p = await lire('?limite=100');
    expect(p.donnees.map(vendeurDe).sort(), 'les quatre vendeurs qui ont vendu, une fois chacun').toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(cleQuiVaut(p.donnees, (n) => ATTENDU[n].ca), `le chiffre d'affaires de chaque vendeur : SUM(quantité × prix) de SES lignes (attendu : Alpha 100, Bravo 60, Charlie 60, Delta 15 ; reçu : ${JSON.stringify(p.donnees)})`).toBeDefined();
    expect(cleQuiVaut(p.donnees, (n) => ATTENDU[n].commandes), `le nombre de COMMANDES (pas de lignes) : \`COUNT(DISTINCT commande)\` — Alpha a 3 lignes réparties sur 2 commandes (attendu : Alpha 2, Bravo 3, Charlie 1, Delta 1 ; reçu : ${JSON.stringify(p.donnees)})`).toBeDefined();
    expect(p.meta, 'le total : le nombre de vendeurs classés').toEqual({ page: 1, limite: 100, total: 4, totalPages: 1 });
  });

  it('du plus gros chiffre d\'affaires au plus faible, avec le rang', async () => {
    const p = await lire('?limite=100');
    const ordre = p.donnees.map(vendeurDe);
    expect(ordre[0], 'Alpha (100 €) en tête').toBe('Alpha');
    expect(ordre.slice(1, 3).sort(), 'Bravo et Charlie (60 € chacun) ensuite').toEqual(['Bravo', 'Charlie']);
    expect(ordre[3], 'Delta (15 €) en dernier').toBe('Delta');
    expect(p.donnees.map((l) => Number(l.rang)), 'un champ `rang` : la position, à partir de 1').toEqual([1, 2, 3, 4]);
  });

  it('l\'égalité est départagée : toujours le même ordre, page après page', async () => {
    const complet = (await lire('?limite=100')).donnees.map(vendeurDe);
    const unParUn: Nom[] = [];
    for (let n = 1; n <= 4; n++) unParUn.push(...(await lire(`?limite=1&page=${n}`)).donnees.map(vendeurDe));
    expect(unParUn, 'un critère de départage (après le chiffre d\'affaires) : sans lui, l\'ordre de Bravo et Charlie n\'est pas garanti d\'une requête à l\'autre').toEqual(complet);
    for (let essai = 0; essai < 3; essai++) expect((await lire('?limite=100')).donnees.map(vendeurDe)).toEqual(complet);
  });

  it('paginé sans perdre les rangs', async () => {
    const p = await lire('?limite=2&page=2');
    expect(p.donnees.map((l) => Number(l.rang)), 'le premier de la page 2 (2 par page) est 3e : `(page - 1) × limite + i + 1`').toEqual([3, 4]);
    expect(p.meta).toEqual({ page: 2, limite: 2, total: 4, totalPages: 2 });
    expect(p.donnees.map(vendeurDe).at(-1)).toBe('Delta');
  });

  it('les paramètres de pagination sont validés', async () => {
    for (const qs of ['limite=101', 'page=0']) {
      const r = await lancee.http().get(`/api/classement-vendeurs?${qs}`).set('Authorization', acheteur.bearer);
      expect(r.status, `?${qs} : \`@Query() { page, limite }: PaginationDto\``).toBe(400);
    }
    expect((await lancee.http().get('/api/classement-vendeurs')).status, 'sans jeton : 401 (le guard global)').toBe(401);
  });
});
