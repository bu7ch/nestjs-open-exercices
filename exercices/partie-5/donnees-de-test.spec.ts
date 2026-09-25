import { compter, executerSeed, lancerAvecBase, sql } from './outils.js';

// Ton src/seed.ts est exécuté comme par `node dist/seed.js`, mais sur la base de test.
const CINQ_TABLES = ['lignes_commande', 'commandes', 'variantes', 'produits', 'vendeurs'];

const comptes = async () => Object.fromEntries(await Promise.all(CINQ_TABLES.map(async (t) => [t, await compter(t)] as const)));

describe('Partie 5 · Les données de test (exercices 5.17 et 5.18)', () => {
  // Si la base ou le script ne démarrent pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      // Des tables neuves et vides, d'après tes entités.
      const lancee = await lancerAvecBase();
      await lancee.fermer();
    } catch (erreur) {
      echec = erreur;
    }
  });

  describe('5.17 · src/seed.ts remplit la base', () => {
    beforeAll(async () => {
      if (!echec) await executerSeed().catch((erreur: unknown) => (echec = erreur));
    });

    it('deux vendeurs, quatre produits répartis entre eux', async () => {
      expect(await compter('vendeurs')).toBe(2);
      expect(await compter('produits')).toBe(4);
      const parVendeur = await sql<{ vendeurId: number | null; n: string }>('SELECT "vendeurId", count(*) AS n FROM produits GROUP BY "vendeurId"');
      expect(parVendeur.every((l) => l.vendeurId !== null), 'chaque produit doit avoir son vendeur').toBe(true);
      expect(parVendeur, 'les produits sont répartis entre les deux vendeurs').toHaveLength(2);
    });

    it('chaque produit a deux ou trois variantes', async () => {
      const parProduit = await sql<{ id: number; n: string }>('SELECT p.id, count(v.id) AS n FROM produits p LEFT JOIN variantes v ON v."produitId" = p.id GROUP BY p.id');
      for (const { id, n } of parProduit) {
        expect(Number(n), `le produit ${id} a ${n} variante(s)`).toBeGreaterThanOrEqual(2);
        expect(Number(n), `le produit ${id} a ${n} variantes`).toBeLessThanOrEqual(3);
      }
    });

    it('une commande de quelques lignes', async () => {
      expect(await compter('commandes')).toBeGreaterThanOrEqual(1);
      const [premiere] = await sql<{ id: number }>('SELECT min(id) AS id FROM commandes');
      expect(await compter('lignes_commande', '"commandeId" = $1', [premiere!.id]), 'quelques lignes : au moins deux').toBeGreaterThanOrEqual(2);
    });

    it('GET /api/vendeurs/1, /api/produits/1 et /api/commandes/1 répondent', async () => {
      const lancee = await lancerAvecBase({ base: 'garder' });
      try {
        await lancee.http().get('/api/vendeurs/1').expect(200);
        await lancee.http().get('/api/produits/1').expect(200);
        const commande = await lancee.http().get('/api/commandes/1').expect(200);
        expect(commande.body.lignes?.length).toBeGreaterThanOrEqual(2);
      } finally {
        await lancee.fermer();
      }
    });
  });

  describe('5.18 · un script qu\'on peut relancer', () => {
    it('relancé, il donne exactement la même base, et les id recommencent à 1', async () => {
      await executerSeed();
      const premiere = await comptes();
      // Une ligne en trop, laissée par quelqu'un d'autre : elle doit disparaître aussi.
      await sql('INSERT INTO vendeurs (nom) VALUES ($1)', ['Ajouté à la main']);
      await executerSeed();
      expect(await comptes(), 'le même nombre de lignes dans chaque table : `TRUNCATE ... RESTART IDENTITY` sur les cinq tables').toEqual(premiere);
      for (const table of CINQ_TABLES) {
        const [{ id }] = (await sql<{ id: number }>(`SELECT min(id) AS id FROM "${table}"`)) as [{ id: number }];
        expect(id, `les id de ${table} doivent recommencer à 1 (RESTART IDENTITY)`).toBe(1);
      }
    });

    it('avec NODE_ENV=production, il refuse de s\'exécuter, sans toucher à la base', async () => {
      await sql('INSERT INTO vendeurs (nom) VALUES ($1)', ['Témoin']);
      const avant = await comptes();
      let refus: unknown;
      await executerSeed({ NODE_ENV: 'production' }).catch((erreur: unknown) => (refus = erreur));
      expect(refus, 'en tête de src/seed.ts : `if (process.env.NODE_ENV === \'production\') throw new Error(...)`').toBeInstanceOf(Error);
      expect(await comptes(), 'le script ne doit rien avoir effacé ni écrit').toEqual(avant);
      expect(await compter('vendeurs', 'nom = $1', ['Témoin'])).toBe(1);
    });
  });
});
