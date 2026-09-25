import * as argon2 from 'argon2';
import type { DataSource, EntityMetadata } from 'typeorm';
import { refusDeDemarrer } from '../aide.js';
import { detail } from '../partie-4/outils.js';
import { chargerMigrations, connexionMigrations, differenceAvecEntites, entite, tables, verifierBaseJoignable, type AppAvecBase } from '../partie-5/outils.js';
import { connecter, decoder, ENV_AUTH, INDICE_COMPTE, inscrire, lancerAvecAuth, ligneCompte, MOT_DE_PASSE, nouvelEmail, SECRET, verifier } from './outils.js';

// 7.2 : l'entité Compte (et sa migration) ; 7.4 à 7.6 : l'inscription, la connexion, le jeton.
// 7.1, 7.3 (le script hachage.mjs, durcir le hachage) et 7.7 (casser un jeton avec jsonwebtoken) se
// font hors de l'application : ils ne sont pas testés ici.

const colonne = (meta: EntityMetadata, nom: string, indice: string) => {
  const c = meta.findColumnWithPropertyName(nom);
  if (!c) throw new Error(`L'entité Compte n'a pas de colonne \`${nom}\`. ${indice}`);
  return c;
};

describe('Partie 7 · Les comptes, l\'inscription et la connexion (exercices 7.2, 7.4 à 7.6)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];

  // Si l'application ne démarre pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
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

  describe('7.2 · l\'entité Compte', () => {
    it('la table `comptes` : id généré, email unique, motDePasseHache jamais chargé par défaut, role', () => {
      const meta = entite(lancee.ds, 'Compte', INDICE_COMPTE);
      expect(meta.tableName, '`@Entity(\'comptes\')`').toBe('comptes');
      expect(meta.primaryColumns.map((c) => c.propertyName)).toEqual(['id']);
      expect(meta.primaryColumns[0]!.isGenerated, '`@PrimaryGeneratedColumn()` sur id').toBe(true);
      colonne(meta, 'email', '`@Column({ unique: true }) email: string`');
      const unique = [...meta.uniques, ...meta.indices.filter((i) => i.isUnique)].some((u) => u.columns.length === 1 && u.columns[0]!.propertyName === 'email');
      expect(unique, '`@Column({ unique: true })` sur email : c\'est la base qui garantit qu\'un email n\'est inscrit qu\'une fois').toBe(true);
      const hache = colonne(meta, 'motDePasseHache', '`@Column({ select: false }) motDePasseHache: string`');
      expect(hache.isSelect, '`select: false` sur motDePasseHache : un find() ne doit pas charger l\'empreinte').toBe(false);
    });

    it('role : du texte (`type: \'varchar\'`), `acheteur` par défaut', () => {
      const meta = entite(lancee.ds, 'Compte', INDICE_COMPTE);
      const role = colonne(meta, 'role', '`@Column({ type: \'varchar\', default: \'acheteur\' }) role: Role`');
      expect(lancee.ds.driver.normalizeType(role), '`type: \'varchar\'` sur role').toBe('character varying');
      expect(role.default, '`default: \'acheteur\'`').toBe('acheteur');
    });

    it('un find() du repository ne renvoie pas le hachage', async () => {
      const compte = await inscrire(http);
      const trouves = (await lancee.ds.getRepository('Compte').find()) as Record<string, unknown>[];
      const lu = trouves.find((c) => c.email === compte.email);
      expect(lu, 'le compte inscrit doit se retrouver avec find()').toBeDefined();
      expect(lu!.motDePasseHache, '`select: false` sur motDePasseHache').toBeUndefined();
    });

    it('tes migrations créent la table comptes telle que la décrit l\'entité (7.2) ; la colonne refreshTokenHache aussi (7.15)', async () => {
      entite(lancee.ds, 'Compte', INDICE_COMPTE);
      await verifierBaseJoignable();
      const migrations = await chargerMigrations();
      let ds: DataSource | undefined;
      try {
        ds = await connexionMigrations(lancee.ds.entityMetadatas.map((m) => m.target), migrations);
        await ds.dropDatabase();
        await ds.runMigrations();
        expect(await tables(), 'aucune de tes migrations ne crée la table comptes : génère-la (`npm run migration:generate -- src/migrations/CreerComptes`), comme en partie 5').toContain('comptes');
        const restantes = (await differenceAvecEntites(ds)).filter((q) => /^\s*(CREATE|ALTER|DROP)\s+TABLE\s+"comptes"/i.test(q));
        expect(
          restantes,
          'après tes migrations, la table comptes ne correspond pas à l\'entité Compte : génère la migration (`npm run migration:generate -- src/migrations/CreerComptes`, puis `npm run migration:run`), comme en partie 5',
        ).toEqual([]);
      } finally {
        await ds?.dropDatabase().catch(() => undefined);
        await ds?.destroy();
        // Les tables des autres tests : recréées d'après tes entités.
        await lancee.ds.synchronize();
      }
    });
  });

  describe('7.4 · POST /api/auth/inscription', () => {
    it('crée un compte `acheteur` et répond 201 avec seulement { id, email }', async () => {
      const email = nouvelEmail('inscription');
      const r = await http().post('/api/auth/inscription').send({ email, motDePasse: MOT_DE_PASSE });
      expect(r.status, 'ajoute `POST /api/auth/inscription`, marquée `@Public()` une fois le guard global en place').toBe(201);
      expect(Object.keys(r.body).sort(), 'renvoie `{ id, email }`, jamais l\'entité entière (elle contient l\'empreinte)').toEqual(['email', 'id']);
      expect(r.body.email).toBe(email);
      expect(typeof r.body.id).toBe('number');
      const ligne = await ligneCompte(lancee.ds, email);
      expect(ligne, 'le compte doit être dans la table comptes').toBeDefined();
      expect(ligne!.id).toBe(r.body.id);
      expect(ligne!.role, 'un compte inscrit est un `acheteur`').toBe('acheteur');
    });

    it('ne stocke jamais le mot de passe : seulement son empreinte argon2', async () => {
      const email = nouvelEmail('hachage');
      await inscrire(http, email);
      const ligne = await ligneCompte(lancee.ds, email);
      const hache = String(ligne?.motDePasseHache);
      expect(JSON.stringify(ligne), 'le mot de passe en clair ne doit se trouver nulle part dans la ligne du compte').not.toContain(MOT_DE_PASSE);
      expect(hache, 'hache le mot de passe avec `await argon2.hash(dto.motDePasse)` (section a)').toMatch(/^\$argon2(id|i|d)\$/);
      expect(await argon2.verify(hache, MOT_DE_PASSE), 'l\'empreinte doit être celle du mot de passe envoyé').toBe(true);
    });

    it('un email déjà inscrit répond 409, sans créer de second compte', async () => {
      const email = nouvelEmail('doublon');
      await inscrire(http, email);
      const r = await http().post('/api/auth/inscription').send({ email, motDePasse: 'UnAutreMotDePasse!' });
      expect(r.status, 'attrape la violation d\'unicité (code 23505) et lève une ConflictException').toBe(409);
      const [ligne] = [await ligneCompte(lancee.ds, email)];
      expect(await argon2.verify(String(ligne?.motDePasseHache), MOT_DE_PASSE), 'le premier compte ne doit pas avoir été modifié').toBe(true);
    });

    it('trois inscriptions simultanées du même email : une 201, deux 409 (jamais de 500)', async () => {
      const email = nouvelEmail('simultane');
      const reponses = await Promise.all([1, 2, 3].map(() => http().post('/api/auth/inscription').send({ email, motDePasse: MOT_DE_PASSE })));
      expect(
        reponses.map((r) => r.status).sort(),
        'vérifier « cet email existe-t-il ? » avant de créer ne suffit pas : c\'est la contrainte unique de la base qui tranche (attrape le code 23505)',
      ).toEqual([201, 409, 409]);
    });

    it('refuse un email invalide, un mot de passe de moins de 8 caractères, un champ manquant (400)', async () => {
      const email = await http().post('/api/auth/inscription').send({ email: 'pas-un-email', motDePasse: MOT_DE_PASSE });
      expect(email.status, '`@IsEmail()` sur email').toBe(400);
      expect(detail(email.body)).toContain('email');
      const court = await http().post('/api/auth/inscription').send({ email: nouvelEmail(), motDePasse: 'Abc!123' });
      expect(court.status, '`@MinLength(8)` sur motDePasse').toBe(400);
      expect(detail(court.body)).toContain('motDePasse');
      const vide = await http().post('/api/auth/inscription').send({});
      expect(vide.status).toBe(400);
    });

    it('on ne choisit pas son rôle à l\'inscription', async () => {
      const email = nouvelEmail('ambitieux');
      const r = await http().post('/api/auth/inscription').send({ email, motDePasse: MOT_DE_PASSE, role: 'admin' });
      expect([201, 400], `réponse ${r.status}`).toContain(r.status);
      const ligne = await ligneCompte(lancee.ds, email);
      if (ligne) expect(ligne.role, 'un `role` envoyé dans le corps ne doit jamais être enregistré').toBe('acheteur');
    });
  });

  describe('7.5 · POST /api/auth/connexion', () => {
    it('répond 200 avec { accessToken }, un JWT signé avec JWT_SECRET qui contient sub, email et role', async () => {
      const compte = await inscrire(http);
      const r = await http().post('/api/auth/connexion').send({ email: compte.email, motDePasse: MOT_DE_PASSE });
      expect(r.status, 'ajoute `POST /api/auth/connexion` avec `@HttpCode(200)` (elle ne crée rien) et `@Public()`').toBe(200);
      expect(typeof r.body.accessToken, 'renvoie `{ accessToken }`').toBe('string');
      const contenu = decoder(r.body.accessToken);
      expect(String(contenu.sub), '`sub` : l\'id du compte').toBe(String(compte.id));
      expect(contenu.email).toBe(compte.email);
      expect(contenu.role).toBe('acheteur');
      expect(JSON.stringify(contenu), 'rien de confidentiel dans le jeton : il est lisible par tous').not.toMatch(/motDePasse|argon2/);
      expect(verifier(r.body.accessToken, SECRET), 'le jeton doit être signé avec JWT_SECRET, lu par ConfigService (`JwtModule.registerAsync`)').not.toBeNull();
    });

    it('le jeton vit 15 minutes', async () => {
      const compte = await inscrire(http);
      const { accessToken } = await connecter(http, compte.email);
      const { iat, exp } = decoder(accessToken) as { iat?: number; exp?: number };
      expect(typeof exp, '`signOptions: { expiresIn: \'15m\' }`').toBe('number');
      expect(exp! - iat!, '`expiresIn: \'15m\'` : exp - iat = 900 secondes').toBe(900);
    });

    it('l\'application refuse de démarrer avec un JWT_SECRET de moins de 32 caractères, ou sans JWT_SECRET', async () => {
      const court = await refusDeDemarrer({ env: { ...ENV_AUTH, JWT_SECRET: 'x'.repeat(31) } }, 'Exige `@IsString() @MinLength(32)` sur JWT_SECRET dans ta validation d\'environnement (partie 4).');
      expect(court).toContain('JWT_SECRET');
      const absent = await refusDeDemarrer({ env: { ...ENV_AUTH, JWT_SECRET: undefined } }, 'JWT_SECRET doit être obligatoire dans ta validation d\'environnement.');
      expect(absent).toContain('JWT_SECRET');
    });
  });

  describe('7.6 · ne rien révéler', () => {
    it('email inconnu et mauvais mot de passe : le même 401, `Identifiants invalides`', async () => {
      const compte = await inscrire(http);
      const inconnu = await http().post('/api/auth/connexion').send({ email: nouvelEmail('fantome'), motDePasse: MOT_DE_PASSE });
      const mauvais = await http().post('/api/auth/connexion').send({ email: compte.email, motDePasse: 'PasLeBonMotDePasse' });
      expect(inconnu.status).toBe(401);
      expect(mauvais.status, 'vérifie le mot de passe avec `argon2.verify(empreinte, dto.motDePasse)`').toBe(401);
      expect(detail(inconnu.body), 'le message du refus').toContain('Identifiants invalides');
      expect(mauvais.body, 'les deux refus doivent être identiques : sinon, on apprend quels emails sont inscrits').toEqual(inconnu.body);
      expect(mauvais.body.accessToken).toBeUndefined();
    });

    it('un email inconnu prend autant de temps qu\'un mauvais mot de passe (le faux hachage)', async () => {
      const compte = await inscrire(http);
      const chrono = async (email: string) => {
        const debut = performance.now();
        await http().post('/api/auth/connexion').send({ email, motDePasse: 'PasLeBonMotDePasse' }).expect(401);
        return performance.now() - debut;
      };
      const inconnus: number[] = [];
      const mauvais: number[] = [];
      await chrono(compte.email); // mise en route
      for (let i = 0; i < 7; i++) {
        inconnus.push(await chrono(nouvelEmail('fantome')));
        mauvais.push(await chrono(compte.email));
      }
      const mediane = (t: number[]) => [...t].sort((a, b) => a - b)[Math.floor(t.length / 2)]!;
      const [a, b] = [mediane(inconnus), mediane(mauvais)];
      expect(
        a / b,
        `email inconnu : ${a.toFixed(1)} ms, mauvais mot de passe : ${b.toFixed(1)} ms. Sans empreinte à vérifier, l'email inconnu répond bien plus vite : vérifie le mot de passe contre une empreinte factice (\`this.hacheFactice\`) quand l'email est inconnu`,
      ).toBeGreaterThan(0.5);
    });
  });
});
