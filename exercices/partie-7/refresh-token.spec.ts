import * as argon2 from 'argon2';
import { refusDeDemarrer } from '../aide.js';
import { entite, type AppAvecBase } from '../partie-5/outils.js';
import { compteConnecte, connecter, decoder, ENV_AUTH, INDICE_COMPTE, lancerAvecAuth, ligneCompte, SECRET, SECRET_REFRESH, verifier, type Jetons } from './outils.js';

// 7.15 à 7.17 : deux jetons, la rotation, la détection de réutilisation, la déconnexion, jwtid.
// La limite « une seule session » (7.17, seconde moitié) est à observer toi-même : ce n'est pas une
// exigence, et une table de sessions (plusieurs appareils) serait tout aussi juste.

describe('Partie 7 · Le refresh token (exercices 7.15 à 7.17)', () => {
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

  const rafraichir = (refreshToken: unknown) => http().post('/api/auth/rafraichir').send({ refreshToken });

  /** Un compte connecté, dont la connexion a bien renvoyé un refresh token. */
  async function session() {
    const compte = await compteConnecte(lancee);
    if (typeof compte.jetons.refreshToken !== 'string') {
      throw new Error(`La connexion doit renvoyer { accessToken, refreshToken } (exercice 7.15). Réponse : ${JSON.stringify(compte.jetons)}`);
    }
    return { ...compte, refreshToken: compte.jetons.refreshToken };
  }

  async function nouvellePaire(refreshToken: string): Promise<Required<Jetons>> {
    const r = await rafraichir(refreshToken);
    if (r.status !== 200) throw new Error(`POST /api/auth/rafraichir a répondu ${r.status} au lieu de 200 (exercice 7.15 : route \`@Public()\`, \`@HttpCode(200)\`). Réponse : ${JSON.stringify(r.body)}`);
    return r.body;
  }

  describe('7.15 · deux jetons', () => {
    it('la colonne refreshTokenHache : du texte, facultative, jamais chargée par défaut', () => {
      const meta = entite(lancee.ds, 'Compte', INDICE_COMPTE);
      const colonne = meta.findColumnWithPropertyName('refreshTokenHache');
      if (!colonne) throw new Error('Ajoute à Compte `@Column({ type: \'varchar\', nullable: true, select: false }) refreshTokenHache: string | null` (exercice 7.15).');
      expect(colonne.isNullable, '`nullable: true` : null veut dire « aucune session ouverte »').toBe(true);
      expect(colonne.isSelect, '`select: false`').toBe(false);
      expect(lancee.ds.driver.normalizeType(colonne), '`type: \'varchar\'`').toBe('character varying');
    });

    it('l\'application refuse de démarrer avec un JWT_REFRESH_SECRET de moins de 32 caractères, ou sans lui', async () => {
      const court = await refusDeDemarrer({ env: { ...ENV_AUTH, JWT_REFRESH_SECRET: 'y'.repeat(31) } }, 'Valide JWT_REFRESH_SECRET comme JWT_SECRET : `@IsString() @MinLength(32)`.');
      expect(court).toContain('JWT_REFRESH_SECRET');
      const absent = await refusDeDemarrer({ env: { ...ENV_AUTH, JWT_REFRESH_SECRET: undefined } }, 'JWT_REFRESH_SECRET doit être obligatoire.');
      expect(absent).toContain('JWT_REFRESH_SECRET');
    });

    it('la connexion renvoie { accessToken, refreshToken } ; le refresh token est signé avec JWT_REFRESH_SECRET', async () => {
      const s = await session();
      expect(verifier(s.refreshToken, SECRET_REFRESH), 'signe le refresh token avec `{ secret: JWT_REFRESH_SECRET }`').not.toBeNull();
      expect(verifier(s.refreshToken, SECRET), 'le refresh token ne doit PAS être signé avec JWT_SECRET : il passerait pour un jeton d\'accès').toBeNull();
      expect(String(decoder(s.refreshToken).sub)).toBe(String(s.id));
    });

    it('seule l\'empreinte argon2 du refresh token est enregistrée', async () => {
      const s = await session();
      const hache = String((await ligneCompte(lancee.ds, s.email))?.refreshTokenHache);
      expect(hache, 'enregistre `await argon2.hash(refreshToken)`, jamais le jeton lui-même').toMatch(/^\$argon2(id|i|d)\$/);
      expect(await argon2.verify(hache, s.refreshToken), 'l\'empreinte doit être celle du refresh token renvoyé').toBe(true);
    });

    it('POST /api/auth/rafraichir échange le refresh token contre une nouvelle paire, qui fonctionne', async () => {
      const s = await session();
      const paire = await nouvellePaire(s.refreshToken);
      expect(typeof paire.accessToken).toBe('string');
      expect(paire.refreshToken, 'la rotation : un NOUVEAU refresh token à chaque renouvellement').not.toBe(s.refreshToken);
      await http().get('/api/auth/moi').set('Authorization', `Bearer ${paire.accessToken}`).expect(200);
      const hache = String((await ligneCompte(lancee.ds, s.email))?.refreshTokenHache);
      expect(await argon2.verify(hache, paire.refreshToken), 'l\'empreinte enregistrée est maintenant celle du nouveau refresh token').toBe(true);
    });

    it('un refresh token invalide répond 401 (jamais 500)', async () => {
      for (const jeton of ['abc', 'a.b.c']) {
        const r = await rafraichir(jeton);
        expect(r.status, `refreshToken: ${JSON.stringify(jeton)} : attrape l'erreur de \`verifyAsync\` et lève une UnauthorizedException`).toBe(401);
      }
    });
  });

  describe('7.16 · réutilisation et déconnexion', () => {
    it('un refresh token déjà échangé est refusé, et révoque même le nouveau (empreinte effacée)', async () => {
      const s = await session();
      const suite = await nouvellePaire(s.refreshToken);
      const r = await rafraichir(s.refreshToken);
      expect(r.status, 'compare le refresh token reçu à l\'empreinte enregistrée (`argon2.verify`) : l\'ancien ne correspond plus').toBe(401);
      expect((await ligneCompte(lancee.ds, s.email))?.refreshTokenHache, 'réutilisation détectée : efface l\'empreinte (`definirRefreshToken(id, null)`)').toBeNull();
      await rafraichir(suite.refreshToken).expect(401);
    });

    it('un jeton d\'accès n\'est pas un refresh token, et l\'inverse', async () => {
      const s = await session();
      const r = await rafraichir(s.jetons.accessToken);
      expect(r.status, 'vérifie le refresh token avec SON secret : `verifyAsync(jeton, { secret: JWT_REFRESH_SECRET })`').toBe(401);
      const moi = await http().get('/api/auth/moi').set('Authorization', `Bearer ${s.refreshToken}`);
      expect(moi.status, 'un refresh token présenté comme `Bearer` doit être refusé par le guard').toBe(401);
    });

    it('POST /api/auth/deconnexion (204) : le refresh token ne marche plus', async () => {
      const s = await session();
      const r = await http().post('/api/auth/deconnexion').set('Authorization', s.bearer);
      expect(r.status, 'ajoute `POST /api/auth/deconnexion` avec `@HttpCode(204)` (jeton d\'accès exigé)').toBe(204);
      expect((await ligneCompte(lancee.ds, s.email))?.refreshTokenHache, 'la déconnexion efface l\'empreinte').toBeNull();
      await rafraichir(s.refreshToken).expect(401);
    });

    it('la déconnexion exige un jeton d\'accès (401 sans)', async () => {
      await http().post('/api/auth/deconnexion').expect(401);
    });
  });

  describe('7.17 · jwtid', () => {
    it('deux refresh tokens émis dans la même seconde sont différents', async () => {
      const s = await session();
      for (let essai = 0; essai < 5; essai++) {
        const a = (await connecter(http, s.email)).refreshToken!;
        const b = (await connecter(http, s.email)).refreshToken!;
        if (decoder(a).iat !== decoder(b).iat) continue; // à cheval sur deux secondes : on recommence
        expect(b, 'sans `jwtid: randomUUID()`, deux jetons de même contenu émis dans la même seconde sont identiques').not.toBe(a);
        return;
      }
      throw new Error('Impossible d\'obtenir deux connexions dans la même seconde : la connexion est-elle anormalement lente ?');
    });
  });
});
