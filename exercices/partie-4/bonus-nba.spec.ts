import { ConfigService } from '@nestjs/config';
import { existe, importer, lancer, meta, refusDeDemarrer, type AppLancee } from '../aide.js';
import { detail } from './outils.js';

// Projet bonus NBA (section g). C'est un projet à part : écris-le dans le dossier `bonus-nba/src/`
// de ce dépôt (avec son propre main.ts et son app.module.ts), pas dans `src/` de la marketplace.
const RACINE = 'bonus-nba/src';
const POSTES = ['meneur', 'arriere', 'ailier', 'ailier-fort', 'pivot'];

type Classe = new (...args: never[]) => unknown;
interface Equipe {
  id: number;
}
interface Joueur {
  id: number;
  poste: string;
  equipeId: number;
}

const importerNba = (chemin: string, indice: string) => importer<Record<string, Classe>>(chemin, indice, RACINE);

describe('Partie 4 · Bonus : le mini-dashboard NBA (exercices 4.17 à 4.22)', () => {
  let lancee: AppLancee;
  let http: AppLancee['http'];

  beforeAll(async () => {
    if (!existe('main', RACINE)) {
      throw new Error('Crée le projet bonus dans bonus-nba/src/ (main.ts, app.module.ts, puis `equipes/`…).');
    }
    lancee = await lancer({ racine: RACINE });
    http = lancee.http;
  });
  afterAll(() => lancee?.fermer());

  const equipes = async (): Promise<Equipe[]> => (await http().get('/api/equipes').expect(200)).body;
  const tousLesJoueurs = async (): Promise<Joueur[]> => (await http().get('/api/joueurs').query({ limite: 100000 }).expect(200)).body;
  const joueurValide = async (extra: Record<string, unknown> = {}) => ({ prenom: 'Victor', nom: 'Wembanyama', poste: 'pivot', equipeId: (await equipes())[0]!.id, ...extra });

  describe('4.17 · les équipes', () => {
    it('GET /api/equipes renvoie la liste (id, nom, ville, conference)', async () => {
      const liste = await equipes();
      expect(Array.isArray(liste) && liste.length > 0).toBe(true);
      for (const e of liste as unknown as Record<string, unknown>[]) {
        expect(typeof e.id).toBe('number');
        expect(typeof e.nom).toBe('string');
        expect(typeof e.ville).toBe('string');
        expect(['Est', 'Ouest']).toContain(e.conference);
      }
    });

    it('GET /api/equipes/:id renvoie l\'équipe demandée', async () => {
      const [premiere] = await equipes();
      const r = await http().get(`/api/equipes/${premiere!.id}`).expect(200);
      expect(r.body).toEqual(premiere);
    });

    it('404 pour un identifiant inconnu, 400 pour un identifiant qui n\'est pas un nombre', async () => {
      await http().get('/api/equipes/999999').expect(404);
      const r = await http().get('/api/equipes/abc');
      expect(r.status, 'ParseIntPipe sur :id').toBe(400);
    });
  });

  describe('4.18 · les joueurs, avec leur équipe', () => {
    it('EquipesModule exporte EquipesService, JoueursModule importe EquipesModule, JoueursService injecte EquipesService', async () => {
      const { EquipesModule } = await importerNba('equipes/equipes.module', 'Génère-le avec `npx nest g resource equipes`.');
      const { EquipesService } = await importerNba('equipes/equipes.service', '');
      const { JoueursModule } = await importerNba('joueurs/joueurs.module', 'Génère-le avec `npx nest g resource joueurs`.');
      const { JoueursService } = await importerNba('joueurs/joueurs.service', 'Génère-le avec `npx nest g resource joueurs`.');
      expect(meta('exports', EquipesModule!)).toContain(EquipesService);
      expect(meta('imports', JoueursModule!)).toContain(EquipesModule);
      expect(meta('design:paramtypes', JoueursService!)).toContain(EquipesService);
    });

    it('GET /api/joueurs/:id renvoie le joueur avec son équipe complète imbriquée', async () => {
      const [joueur] = await tousLesJoueurs();
      expect(joueur, 'il faut au moins un joueur dans ton tableau en mémoire').toBeDefined();
      for (const cle of ['id', 'prenom', 'nom', 'poste']) expect(joueur).toHaveProperty(cle);
      const equipe = (await http().get(`/api/equipes/${joueur!.equipeId}`).expect(200)).body;
      const r = await http().get(`/api/joueurs/${joueur!.id}`).expect(200);
      expect(r.body).toMatchObject({ id: joueur!.id });
      const imbriquee = Object.values(r.body).some((v) => JSON.stringify(v) === JSON.stringify(equipe));
      expect(imbriquee, `la réponse doit contenir l'équipe complète (${JSON.stringify(equipe)}), pas seulement equipeId`).toBe(true);
    });

    it('404 si le joueur n\'existe pas', async () => {
      await http().get('/api/joueurs/999999').expect(404);
    });
  });

  describe('4.19 · PosteValidePipe et GET /api/joueurs/poste/:poste', () => {
    it('renvoie les joueurs de ce poste, toutes équipes confondues', async () => {
      const tous = await tousLesJoueurs();
      for (const poste of POSTES) {
        const r = await http().get(`/api/joueurs/poste/${poste}`);
        expect(r.status, `le poste « ${poste} » doit être accepté`).toBe(200);
        expect(r.body).toEqual(tous.filter((j) => j.poste === poste));
      }
    });

    it('refuse un poste inconnu avec un 400', async () => {
      const r = await http().get('/api/joueurs/poste/gardien');
      expect(r.status, 'PosteValidePipe doit lever une BadRequestException').toBe(400);
    });
  });

  describe('4.20 · POST /api/joueurs, validé', () => {
    it('crée un joueur valide (201)', async () => {
      const joueur = await joueurValide();
      const r = await http().post('/api/joueurs').send(joueur).expect(201);
      expect(r.body).toMatchObject(joueur);
      expect(typeof r.body.id).toBe('number');
      expect((await tousLesJoueurs()).map((j) => j.id)).toContain(r.body.id);
    });

    it('refuse un prénom ou un nom manquant ou vide (400)', async () => {
      const { prenom: _p, ...sansPrenom } = await joueurValide();
      let r = await http().post('/api/joueurs').send(sansPrenom);
      expect(r.status).toBe(400);
      expect(detail(r.body)).toContain('prenom');
      r = await http().post('/api/joueurs').send(await joueurValide({ nom: '' }));
      expect(r.status).toBe(400);
      expect(detail(r.body)).toContain('nom');
    });

    it('refuse un poste hors des cinq postes (400)', async () => {
      const r = await http().post('/api/joueurs').send(await joueurValide({ poste: 'gardien' }));
      expect(r.status).toBe(400);
      expect(detail(r.body)).toContain('poste');
    });

    it('refuse un equipeId qui n\'est pas un entier (400)', async () => {
      for (const equipeId of ['1', 1.5]) {
        const r = await http().post('/api/joueurs').send(await joueurValide({ equipeId }));
        expect(r.status, `equipeId = ${JSON.stringify(equipeId)} : @IsInt()`).toBe(400);
        expect(detail(r.body)).toContain('equipeId');
      }
    });

    it('refuse un champ en trop (400), avec un message qui le nomme', async () => {
      const r = await http().post('/api/joueurs').send(await joueurValide({ numero: 23 }));
      expect(r.status, 'whitelist: true et forbidNonWhitelisted: true').toBe(400);
      expect(detail(r.body)).toContain('numero');
    });

    it('refuse une équipe qui n\'existe pas (400, BadRequestException)', async () => {
      const avant = (await tousLesJoueurs()).length;
      const r = await http().post('/api/joueurs').send(await joueurValide({ equipeId: 999999 }));
      expect(r.status).toBe(400);
      expect((await tousLesJoueurs()).length).toBe(avant);
    });
  });

  describe('4.21 · ?limite= avec DefaultValuePipe(5) et ParseIntPipe', () => {
    beforeAll(async () => {
      // Au moins 6 joueurs, pour voir la limite par défaut à l'œuvre.
      for (let n = (await tousLesJoueurs()).length; n < 6; n++) {
        await http().post('/api/joueurs').send(await joueurValide({ prenom: `Joueur ${n}` })).expect(201);
      }
    });

    it('sans le paramètre, renvoie les 5 premiers joueurs', async () => {
      const tous = await tousLesJoueurs();
      const r = await http().get('/api/joueurs').expect(200);
      expect(r.body, 'DefaultValuePipe(5)').toHaveLength(5);
      expect(r.body).toEqual(tous.slice(0, 5));
    });

    it('avec ?limite=2, renvoie les deux premiers', async () => {
      const tous = await tousLesJoueurs();
      const r = await http().get('/api/joueurs').query({ limite: 2 }).expect(200);
      expect(r.body).toEqual(tous.slice(0, 2));
    });

    it('avec ?limite=abc, répond 400 (ParseIntPipe)', async () => {
      const r = await http().get('/api/joueurs').query({ limite: 'abc' });
      expect(r.status).toBe(400);
    });
  });

  describe('4.22 · NOMBRE_MAX_JOUEURS, configuré et validé', () => {
    it('ConfigService est injecté dans JoueursService', async () => {
      const { JoueursService } = await importerNba('joueurs/joueurs.service', '');
      expect(meta('design:paramtypes', JoueursService!)).toContain(ConfigService);
    });

    it('la création est refusée (400) quand le nombre de joueurs a atteint NOMBRE_MAX_JOUEURS', async () => {
      let app: AppLancee = await lancer({ racine: RACINE });
      const depart = (await app.http().get('/api/joueurs').query({ limite: 100000 }).expect(200)).body.length as number;
      await app.fermer();

      app = await lancer({ racine: RACINE, env: { NOMBRE_MAX_JOUEURS: String(depart + 1) } });
      try {
        const equipeId = (await app.http().get('/api/equipes').expect(200)).body[0].id;
        const joueur = { prenom: 'Victor', nom: 'Wembanyama', poste: 'pivot', equipeId };
        await app.http().post('/api/joueurs').send(joueur).expect(201);
        const r = await app.http().post('/api/joueurs').send({ ...joueur, prenom: 'Un de trop' });
        expect(r.status, `avec NOMBRE_MAX_JOUEURS=${depart + 1}, la création suivante doit lever une BadRequestException`).toBe(400);
      } finally {
        await app.fermer();
      }
    });

    it('sans NOMBRE_MAX_JOUEURS, le serveur refuse de démarrer, avec un message qui nomme la variable', async () => {
      const message = await refusDeDemarrer(
        { racine: RACINE, env: { NOMBRE_MAX_JOUEURS: undefined } },
        'Ajoute `validate: validerEnvironnement` (avec NOMBRE_MAX_JOUEURS) à `ConfigModule.forRoot(...)`.',
      );
      expect(message).toContain('NOMBRE_MAX_JOUEURS');
    });
  });
});
