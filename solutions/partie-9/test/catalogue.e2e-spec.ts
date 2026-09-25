import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { compteConnecte, demarrerApp, viderLaBase } from './app-de-test.js';

// 9.4 à 9.11 et 9.13 : le catalogue en deux versions, paginé, filtré, trié, et ses erreurs par champ.
// 8.13 : toute réponse réussie est enveloppée : la page est dans `body.data`.
describe('Catalogue v1 / v2 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: Awaited<ReturnType<typeof demarrerApp>>['http'];
  let bearer: string;

  const get = (chemin: string) => http().get(chemin).set('Authorization', bearer);
  // 25 produits actifs, de 11 € à 35 €, tous en mobilier.
  const remplir = () => dataSource.query(`INSERT INTO produits (nom, prix, categorie) SELECT 'Produit ' || lpad(i::text, 2, '0'), 10 + i, 'mobilier' FROM generate_series(1, 25) AS i`);
  const ajouter = (nom: string, prix: number, categorie = 'mobilier', actif = true) =>
    dataSource.query('INSERT INTO produits (nom, prix, categorie, actif) VALUES ($1, $2, $3, $4)', [nom, prix, categorie, actif]);
  const ids = (body: { data: { donnees: { id: number }[] } }) => body.data.donnees.map((p) => p.id);

  beforeAll(async () => {
    ({ app, dataSource, http } = await demarrerApp());
  });

  beforeEach(async () => {
    await viderLaBase(dataSource);
    ({ bearer } = await compteConnecte(http, dataSource, 'acheteur@exemple.fr'));
    await remplir();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('versions (9.4 à 9.6)', () => {
    it('v1 (sans version) renvoie un tableau et annonce sa fin de vie', async () => {
      const r = await get('/api/produits').expect(200);
      expect(Array.isArray(r.body.data)).toBe(true);
      expect(r.headers['deprecation']).toBe('true');
      expect(r.headers['sunset']).toContain('2027');
    });

    it('v2 répond, sans annonce ; /v1 n\'existe pas', async () => {
      const r = await get('/v2/api/produits').expect(200);
      expect(r.headers['deprecation']).toBeUndefined();
      await get('/v1/api/produits').expect(404);
    });

    it('le détail répond sans version comme en v2, mais pas en v1 explicite', async () => {
      await get('/api/produits/1').expect(200);
      await get('/v2/api/produits/1').expect(200);
      // Normal : la version 1 n'a jamais eu de préfixe, `@Version([VERSION_NEUTRAL, '2'])` ne lui en donne pas.
      await get('/v1/api/produits/1').expect(404);
    });
  });

  describe('pagination (9.7 à 9.9)', () => {
    it('page 3 de 10 : les 5 derniers, avec le bon meta', async () => {
      const r = await get('/v2/api/produits?limite=10&page=3').expect(200);
      expect(r.body.data.donnees).toHaveLength(5);
      expect(r.body.data.meta).toEqual({ page: 3, limite: 10, total: 25, totalPages: 3 });
    });

    it('page au-delà de la fin : 200 et liste vide', async () => {
      const r = await get('/v2/api/produits?page=99').expect(200);
      expect(r.body.data.donnees).toEqual([]);
      expect(r.body.data.meta.total).toBe(25);
    });

    it.each(['page=0', 'page=abc', 'limite=0', 'limite=101', 'limite=2.5', 'inconnu=1'])('refuse ?%s avec 400', async (qs) => {
      await get(`/v2/api/produits?${qs}`).expect(400);
    });

    it('9.8 : ?page=2 arrive en nombre (@Type)', async () => {
      const r = await get('/v2/api/produits?page=2&limite=10').expect(200);
      expect(r.body.data.meta.page).toBe(2);
    });

    it('curseur : parcourt tout sans doublon ni oubli', async () => {
      const vus: number[] = [];
      let apres = 0;
      for (let tour = 0; tour < 10; tour++) {
        const r = await get(`/v2/api/produits/curseur?apres=${apres}&limite=10`).expect(200);
        vus.push(...ids(r.body));
        if (r.body.data.curseurSuivant === null) break;
        apres = r.body.data.curseurSuivant;
      }
      expect(vus).toHaveLength(25);
      expect(new Set(vus).size).toBe(25);
    });

    it('un ajout entre deux pages fait répéter un produit, mais pas avec le curseur', async () => {
      const page1 = ids((await get('/v2/api/produits?limite=10&page=1').expect(200)).body);
      const curseur1 = (await get('/v2/api/produits/curseur?limite=10').expect(200)).body.data;
      await ajouter('Nouveau', 50);
      const page2 = ids((await get('/v2/api/produits?limite=10&page=2').expect(200)).body);
      // Du plus récent au plus ancien (25 à 16), l'ajout du 26 fait commencer la page 2 par le 16.
      expect(page2.filter((id) => page1.includes(id))).toEqual([16]);
      const curseur2 = (await get(`/v2/api/produits/curseur?limite=10&apres=${curseur1.curseurSuivant}`).expect(200)).body.data;
      const vus = [...curseur1.donnees, ...curseur2.donnees].map((p: { id: number }) => p.id);
      expect(new Set(vus).size).toBe(vus.length);
    });
  });

  describe('filtres et tri (9.10, 9.11)', () => {
    it('filtre par catégorie et prix (en centimes), et compte le total filtré', async () => {
      await ajouter('Cahier', 3, 'papeterie');
      await ajouter('Classeur', 12, 'papeterie');
      await ajouter('Agenda', 12, 'papeterie', false);
      const r = await get('/v2/api/produits?categorie=papeterie&prixMin=1000&prixMax=2000').expect(200);
      expect(r.body.data.donnees.map((p: { nom: string }) => p.nom)).toEqual(['Classeur']);
      expect(r.body.data.meta.total).toBe(1);
    });

    it('refuse prixMin supérieur à prixMax, avec un message explicite', async () => {
      const r = await get('/v2/api/produits?prixMin=3000&prixMax=1000').expect(400);
      expect(r.body.message).toBe('prixMin ne peut pas dépasser prixMax');
    });

    it('tri par prix décroissant', async () => {
      const r = await get('/v2/api/produits?tri=prix&ordre=desc&limite=3').expect(200);
      expect(r.body.data.donnees.map((p: { prix: string }) => p.prix)).toEqual(['35.00', '34.00', '33.00']);
    });

    it('tri par id décroissant est bien décroissant', async () => {
      const r = await get('/v2/api/produits?tri=id&ordre=desc&limite=5').expect(200);
      expect(ids(r.body)).toEqual([25, 24, 23, 22, 21]);
    });

    it.each(['tri=motdepasse', 'ordre=up', 'categorie=jardin', `tri=${encodeURIComponent('id DESC, (SELECT 1/0)')}`])('refuse ?%s avec 400', async (qs) => {
      await get(`/v2/api/produits?${qs}`).expect(400);
    });

    it('la recherche échappe % et _', async () => {
      await ajouter('Hameau 100%', 5);
      await ajouter('Hameau 100x', 5);
      await ajouter('Lune_Rousse', 5);
      await ajouter('LuneXRousse', 5);
      const pourcent = await get(`/v2/api/produits?recherche=${encodeURIComponent('100%')}`).expect(200);
      expect(pourcent.body.data.donnees.map((p: { nom: string }) => p.nom)).toEqual(['Hameau 100%']);
      const souligne = await get('/v2/api/produits?recherche=lune_').expect(200);
      expect(souligne.body.data.donnees.map((p: { nom: string }) => p.nom)).toEqual(['Lune_Rousse']);
    });
  });

  describe('erreurs par champ (9.13)', () => {
    it('validation : message à plat ET détail par champ', async () => {
      const r = await get('/v2/api/produits?limite=500&page=0').set('X-Request-Id', 'abc-1').expect(400);
      expect(r.body).toMatchObject({ statusCode: 400, requeteId: 'abc-1' });
      expect(r.body.champs).toEqual(
        expect.arrayContaining([
          { champ: 'page', erreurs: ['page must not be less than 1'] },
          { champ: 'limite', erreurs: ['limite must not be greater than 100'] },
        ]),
      );
    });

    it('paramètre inconnu : rejeté avec le nom du champ', async () => {
      const r = await get('/v2/api/produits?tri=nom&colonne=x').expect(400);
      expect(r.body.champs).toEqual([{ champ: 'colonne', erreurs: ['property colonne should not exist'] }]);
    });

    it('un 404 n\'a pas de champs', async () => {
      const r = await get('/api/produits/9999').expect(404);
      expect(r.body.champs).toBeUndefined();
    });
  });
});
