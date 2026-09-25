import { produitValide } from '../partie-4/outils.js';
import {
  colonnes,
  compter,
  creerCommande,
  creerProduitDuVendeur,
  creerVariante,
  creerVendeur,
  entite,
  lancerAvecBase,
  relationVers,
  sql,
  type AppAvecBase,
} from './outils.js';

describe('Partie 5 · Les relations (exercices 5.9 à 5.13)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];

  // Si l'application ne démarre pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      lancee = await lancerAvecBase();
      http = lancee.http;
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  const tableDe = (nom: string, indice: string) => entite(lancee.ds, nom, indice).tableName;
  const tableProduits = () => tableDe('Produit', 'exercice 5.8');
  const tableVariantes = () => tableDe('Variante', 'Crée l\'entité `Variante` (exercice 5.11).');

  /** Un vendeur, un produit à lui et une variante de ce produit. */
  async function vendeurProduitVariante(nom: string) {
    const vendeur = await creerVendeur(http, nom);
    const produit = await creerProduitDuVendeur(http, vendeur.id, await produitValide(http, { nom: `Produit de ${nom}` }));
    const variante = await creerVariante(http, produit.id, 'Bleu');
    return { vendeur, produit, variante };
  }

  describe('5.9 · les produits d\'un vendeur', () => {
    it('Produit → Vendeur en @ManyToOne (onDelete: CASCADE), Vendeur → Produit en @OneToMany', () => {
      const produit = entite(lancee.ds, 'Produit', 'exercice 5.8');
      const vendeur = entite(lancee.ds, 'Vendeur', 'exercice 5.3');
      const versVendeur = relationVers(produit, 'Vendeur', 'many-to-one');
      expect(versVendeur, '`@ManyToOne(\'Vendeur\', \'produits\', { onDelete: \'CASCADE\' }) vendeur: Vendeur` sur Produit').toBeDefined();
      expect(versVendeur!.onDelete, '`onDelete: \'CASCADE\'` sur la relation Produit → Vendeur').toBe('CASCADE');
      expect(relationVers(vendeur, 'Produit', 'one-to-many'), '`@OneToMany(\'Produit\', \'vendeur\') produits: Produit[]` sur Vendeur').toBeDefined();
    });

    it('la table des produits a une colonne `vendeurId`', async () => {
      expect(await colonnes(tableProduits()), 'nomme la relation `vendeur` : TypeORM en tire la colonne vendeurId').toContain('vendeurId');
    });

    it('POST /api/vendeurs/:id/produits crée un produit rattaché au vendeur (201)', async () => {
      const vendeur = await creerVendeur(http, 'La Papeterie');
      const r = await http().post(`/api/vendeurs/${vendeur.id}/produits`).send(await produitValide(http, { nom: 'Stylo du vendeur' }));
      expect(r.status, 'ajoute `POST /api/vendeurs/:id/produits`').toBe(201);
      expect(typeof r.body.id).toBe('number');
      const [ligne] = await sql<{ vendeurId: number | null }>(`SELECT "vendeurId" FROM "${tableProduits()}" WHERE id = $1`, [r.body.id]);
      expect(ligne?.vendeurId, 'le produit doit être rattaché au vendeur (colonne vendeurId)').toBe(vendeur.id);
    });

    it('répond 404 si le vendeur n\'existe pas, sans créer de produit', async () => {
      const avant = await compter(tableProduits());
      const r = await http().post('/api/vendeurs/999999/produits').send(await produitValide(http));
      expect(r.status).toBe(404);
      expect(await compter(tableProduits())).toBe(avant);
    });

    it('valide le produit avec le DTO de la partie 4 (400 pour un prix négatif)', async () => {
      const vendeur = await creerVendeur(http, 'Vendeur exigeant');
      const r = await http().post(`/api/vendeurs/${vendeur.id}/produits`).send(await produitValide(http, { prix: -1 }));
      expect(r.status, '`@Body() dto: CreerProduitDto`').toBe(400);
    });

    it('supprimer un vendeur supprime ses produits (CASCADE)', async () => {
      const vendeur = await creerVendeur(http, 'Vendeur éphémère');
      const produit = await creerProduitDuVendeur(http, vendeur.id, await produitValide(http, { nom: 'Produit éphémère' }));
      await http().delete(`/api/vendeurs/${vendeur.id}`).expect(204);
      expect(await compter(tableProduits(), 'id = $1', [produit.id]), '`onDelete: \'CASCADE\'` : les produits du vendeur disparaissent avec lui').toBe(0);
    });
  });

  it('5.10 · GET /api/vendeurs/:id renvoie le vendeur avec ses produits', async () => {
    const vendeur = await creerVendeur(http, 'Vendeur complet');
    const produit = await creerProduitDuVendeur(http, vendeur.id, await produitValide(http, { nom: 'Produit listé' }));
    const autre = await creerVendeur(http, 'Autre vendeur');
    await creerProduitDuVendeur(http, autre.id, await produitValide(http, { nom: 'Pas à lui' }));
    const r = await http().get(`/api/vendeurs/${vendeur.id}`).expect(200);
    expect(Array.isArray(r.body.produits), 'charge la relation : `findOne({ where: { id }, relations: { produits: true } })`').toBe(true);
    expect(r.body.produits.map((p: { id: number; nom: string }) => ({ id: p.id, nom: p.nom }))).toEqual([{ id: produit.id, nom: 'Produit listé' }]);
  });

  describe('5.11 · les variantes', () => {
    it('l\'entité Variante (nom, stock par défaut à 0) est reliée à Produit (@ManyToOne, onDelete: CASCADE)', () => {
      const variante = entite(lancee.ds, 'Variante', 'Crée l\'entité `Variante` (exercice 5.11).');
      expect(variante.findColumnWithPropertyName('nom')).toBeDefined();
      const stock = variante.findColumnWithPropertyName('stock');
      expect(stock, 'colonne `stock`').toBeDefined();
      expect(Number(stock!.default), '`@Column({ default: 0 })` sur stock').toBe(0);
      const versProduit = relationVers(variante, 'Produit', 'many-to-one');
      expect(versProduit, '`@ManyToOne` de Variante vers Produit').toBeDefined();
      expect(versProduit!.onDelete).toBe('CASCADE');
    });

    it('POST /api/produits/:id/variantes crée une variante, et GET /api/produits/:id la renvoie (stock 0)', async () => {
      const vendeur = await creerVendeur(http, 'Vendeur de variantes');
      const produit = await creerProduitDuVendeur(http, vendeur.id, await produitValide(http, { nom: 'T-shirt' }));
      const r = await http().post(`/api/produits/${produit.id}/variantes`).send({ nom: 'Rouge' });
      expect(r.status, 'ajoute `POST /api/produits/:id/variantes`').toBe(201);
      const lu = await http().get(`/api/produits/${produit.id}`).expect(200);
      expect(Array.isArray(lu.body.variantes), '`GET /api/produits/:id` doit charger la relation `variantes`').toBe(true);
      expect(lu.body.variantes).toHaveLength(1);
      expect(lu.body.variantes[0]).toMatchObject({ nom: 'Rouge', stock: 0 });
    });

    it('répond 404 si le produit n\'existe pas', async () => {
      const r = await http().post('/api/produits/999999/variantes').send({ nom: 'Fantôme' });
      expect(r.status).toBe(404);
    });

    it('supprimer le vendeur supprime ses produits et leurs variantes (CASCADE)', async () => {
      const { vendeur, variante } = await vendeurProduitVariante('Vendeur en cascade');
      await http().delete(`/api/vendeurs/${vendeur.id}`).expect(204);
      expect(await compter(tableVariantes(), 'id = $1', [variante.id])).toBe(0);
    });
  });

  describe('5.12 · une commande et ses lignes', () => {
    it('les entités Commande (dateCommande) et LigneCommande (quantite) sont reliées', () => {
      const commande = entite(lancee.ds, 'Commande', 'Crée l\'entité `Commande` (exercice 5.12).');
      const ligne = entite(lancee.ds, 'LigneCommande', 'Crée l\'entité `LigneCommande` (exercice 5.12).');
      expect(commande.createDateColumn?.propertyName, '`@CreateDateColumn() dateCommande: Date`').toBe('dateCommande');
      expect(ligne.findColumnWithPropertyName('quantite')).toBeDefined();
      const versCommande = relationVers(ligne, 'Commande', 'many-to-one');
      expect(versCommande, '`@ManyToOne` de LigneCommande vers Commande').toBeDefined();
      expect(versCommande!.onDelete).toBe('CASCADE');
      expect(relationVers(ligne, 'Variante', 'many-to-one'), '`@ManyToOne` de LigneCommande vers Variante').toBeDefined();
      const lignes = relationVers(commande, 'LigneCommande', 'one-to-many');
      expect(lignes?.propertyName, '`@OneToMany(...) lignes` sur Commande').toBe('lignes');
      expect(lignes!.isCascadeInsert, '`{ cascade: true }` sur lignes').toBe(true);
    });

    it('POST /api/commandes enregistre la commande et toutes ses lignes', async () => {
      const a = await vendeurProduitVariante('Vendeur A');
      const b = await vendeurProduitVariante('Vendeur B');
      const r = await http().post('/api/commandes').send({ lignes: [{ varianteId: a.variante.id, quantite: 2 }, { varianteId: b.variante.id, quantite: 1 }] });
      expect(r.status, 'ajoute `POST /api/commandes`').toBe(201);
      expect(typeof r.body.id).toBe('number');
      const tableLignes = tableDe('LigneCommande', '');
      expect(await compter(tableLignes, '"commandeId" = $1', [r.body.id]), '`save` de la commande doit écrire ses deux lignes (`cascade: true`)').toBe(2);
    });

    it('GET /api/commandes/:id renvoie la commande, ses lignes, leur variante et le produit de chacune', async () => {
      const { produit, variante } = await vendeurProduitVariante('Vendeur C');
      const commande = await creerCommande(http, [{ varianteId: variante.id, quantite: 3 }]);
      const r = await http().get(`/api/commandes/${commande.id}`);
      expect(r.status, 'ajoute `GET /api/commandes/:id`').toBe(200);
      expect(r.body.id).toBe(commande.id);
      expect(Number.isNaN(Date.parse(r.body.dateCommande)), 'dateCommande est remplie par la base').toBe(false);
      expect(r.body.lignes, '`relations: { lignes: { variante: { produit: true } } }`').toHaveLength(1);
      const [ligne] = r.body.lignes;
      expect(ligne.quantite).toBe(3);
      expect(ligne.variante?.id).toBe(variante.id);
      expect(ligne.variante?.produit?.id, 'le produit de la variante doit être chargé aussi').toBe(produit.id);
    });

    it('répond 404 pour une commande inconnue', async () => {
      await http().get('/api/commandes/999999').expect(404);
    });
  });

  describe('5.13 · ce que la base refuse', () => {
    it('supprimer le vendeur d\'un produit commandé répond 409, sans rien supprimer', async () => {
      const { vendeur, produit, variante } = await vendeurProduitVariante('Vendeur commandé');
      await creerCommande(http, [{ varianteId: variante.id, quantite: 1 }]);
      const r = await http().delete(`/api/vendeurs/${vendeur.id}`);
      expect(r.status, 'attrape la QueryFailedError de code 23503 et lève une ConflictException').toBe(409);
      expect(typeof r.body.message === 'string' && r.body.message.length > 0, 'un message clair dans la ConflictException').toBe(true);
      await http().get(`/api/vendeurs/${vendeur.id}`).expect(200);
      expect(await compter(tableProduits(), 'id = $1', [produit.id])).toBe(1);
    });

    it('supprimer un vendeur inconnu répond toujours 404', async () => {
      await http().delete('/api/vendeurs/999999').expect(404);
    });
  });
});
