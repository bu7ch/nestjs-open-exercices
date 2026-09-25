import { trouverExport } from '../aide.js';
import type { AppAvecBase } from '../partie-5/outils.js';
import { compteConnecte, definirRole, fabriquerJeton, gardesGlobaux, lancerAvecAuth } from './outils.js';

// 7.8 : le guard global et @Public() ; 7.9 : GET /api/auth/moi et @CompteCourant() ; 7.10 : les jetons
// refusés (les cas de ton test e2e). 7.11 (le guard dans main.ts, exprès) est à faire toi-même ; ce
// fichier vérifie seulement que le guard est bien déclaré avec APP_GUARD.

// Les routes des parties 3 à 6 : toutes exigent maintenant un jeton (même pour un id qui n'existe pas :
// le guard passe AVANT le contrôleur).
const ROUTES: [string, string][] = [
  ['get', '/api/produits'],
  ['get', '/api/produits/1'],
  ['post', '/api/produits'],
  ['get', '/api/categories'],
  ['get', '/api/vendeurs'],
  ['get', '/api/vendeurs/1'],
  ['post', '/api/vendeurs'],
  ['patch', '/api/vendeurs/1'],
  ['delete', '/api/vendeurs/1'],
  ['post', '/api/commandes'],
  ['post', '/api/prix/total'],
  ['get', '/api/auth/moi'],
];

describe('Partie 7 · Protéger les routes (exercices 7.8 à 7.10)', () => {
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

  describe('7.8 · un guard global', () => {
    it('sans jeton, toutes les routes de la marketplace répondent 401', async () => {
      const ouvertes: string[] = [];
      for (const [methode, route] of ROUTES) {
        const r = await (http() as unknown as Record<string, (url: string) => Promise<{ status: number }>>)[methode]!(route);
        if (r.status !== 401) ouvertes.push(`${methode.toUpperCase()} ${route} → ${r.status}`);
      }
      expect(ouvertes, 'ces routes répondent sans jeton : enregistre ton AuthGuard avec `{ provide: APP_GUARD, useClass: AuthGuard }` dans AuthModule').toEqual([]);
    });

    it('avec un jeton obtenu à la connexion, elles répondent de nouveau', async () => {
      const { bearer } = await compteConnecte(lancee);
      const r = await http().get('/api/produits').set('Authorization', bearer);
      expect(r.status, 'avec `Authorization: Bearer <jeton>`, le guard doit laisser passer').toBe(200);
      await http().get('/api/categories').set('Authorization', bearer).expect(200);
    });

    it('l\'inscription et la connexion restent ouvertes, sans jeton (@Public)', async () => {
      // compteConnecte s'inscrit puis se connecte, sans jeton : il échoue avec un message clair sinon.
      await compteConnecte(lancee);
    });

    it('le décorateur @Public() existe, et le guard est déclaré avec APP_GUARD (pas dans main.ts)', async () => {
      const Public = await trouverExport<() => unknown>('Public', 'Écris le décorateur `export const Public = () => SetMetadata(EST_PUBLIC, true)` (exercice 7.8).');
      expect(typeof Public).toBe('function');
      const gardes = await gardesGlobaux();
      const authentification = gardes.filter((g) => !/^(Throttler|Roles)Guard$/.test(g));
      expect(
        authentification,
        `aucun guard d'authentification déclaré avec \`{ provide: APP_GUARD, useClass: AuthGuard }\` dans un module (guards globaux trouvés : ${gardes.join(', ') || 'aucun'}). Avec \`app.useGlobalGuards\` dans main.ts, il n'existerait pas dans les tests (exercice 7.11)`,
      ).not.toHaveLength(0);
    });
  });

  describe('7.8, 7.10 · les jetons refusés (401)', () => {
    it('un jeton qui n\'en est pas un, ou présenté sans `Bearer`', async () => {
      const { jetons } = await compteConnecte(lancee);
      for (const entete of ['Bearer abc', `Basic ${jetons.accessToken}`, jetons.accessToken, 'Bearer']) {
        const r = await http().get('/api/auth/moi').set('Authorization', entete);
        expect(r.status, `Authorization: ${entete.slice(0, 20)}… : le guard attend \`Bearer <jeton>\``).toBe(401);
      }
    });

    it('un jeton falsifié : contenu modifié (`role: admin`), signature conservée', async () => {
      const compte = await compteConnecte(lancee);
      const [entete, , signature] = compte.jetons.accessToken.split('.');
      const faux = Buffer.from(JSON.stringify({ sub: compte.id, email: compte.email, role: 'admin' })).toString('base64url');
      const r = await http().get('/api/auth/moi').set('Authorization', `Bearer ${entete}.${faux}.${signature}`);
      expect(r.status, 'vérifie le jeton avec `jwt.verifyAsync(jeton)` : la signature ne correspond plus au contenu').toBe(401);
    });

    it('un jeton expiré', async () => {
      const compte = await compteConnecte(lancee);
      const expire = fabriquerJeton({ sub: compte.id, email: compte.email, role: 'acheteur' }, { expiresIn: -10 });
      const r = await http().get('/api/auth/moi').set('Authorization', `Bearer ${expire}`);
      expect(r.status, '`verifyAsync` vérifie aussi `exp` : ne l\'ignore pas (`ignoreExpiration`)').toBe(401);
    });

    it('un jeton signé avec un autre secret que JWT_SECRET', async () => {
      const compte = await compteConnecte(lancee);
      const etranger = fabriquerJeton({ sub: compte.id, email: compte.email, role: 'acheteur' }, {}, 'un-autre-secret-de-plus-de-32-caracteres-xyz');
      const r = await http().get('/api/auth/moi').set('Authorization', `Bearer ${etranger}`);
      expect(r.status).toBe(401);
    });

    it('un jeton bien signé avec JWT_SECRET est accepté (le secret vient bien de ta configuration)', async () => {
      const compte = await compteConnecte(lancee);
      const jeton = fabriquerJeton({ sub: compte.id, email: compte.email, role: 'acheteur' });
      const r = await http().get('/api/produits').set('Authorization', `Bearer ${jeton}`);
      expect(r.status, 'JwtModule doit lire JWT_SECRET avec ConfigService').toBe(200);
    });
  });

  describe('7.9 · GET /api/auth/moi', () => {
    it('renvoie { id, email, role } du compte connecté, sans aucune empreinte', async () => {
      const compte = await compteConnecte(lancee);
      const r = await http().get('/api/auth/moi').set('Authorization', compte.bearer);
      expect(r.status, 'ajoute `GET /api/auth/moi`, qui lit le compte avec `@CompteCourant()`').toBe(200);
      expect(r.body).toMatchObject({ id: compte.id, email: compte.email, role: 'acheteur' });
      expect(r.body.motDePasseHache, 'jamais l\'empreinte du mot de passe dans une réponse').toBeUndefined();
      expect(JSON.stringify(r.body), 'aucune empreinte (mot de passe, refresh token) dans la réponse').not.toContain('$argon2');
    });

    it('les données sont lues en base, pas seulement dans le jeton', async () => {
      const compte = await compteConnecte(lancee);
      await definirRole(lancee.ds, compte.email, 'vendeur');
      const r = await http().get('/api/auth/moi').set('Authorization', compte.bearer).expect(200);
      expect(r.body.role, 'relis le compte en base (`trouverParId`) : le jeton dit encore `acheteur`, la base dit `vendeur`').toBe('vendeur');
    });

    it('le décorateur @CompteCourant() existe', async () => {
      const CompteCourant = await trouverExport('CompteCourant', 'Écris `export const CompteCourant = createParamDecorator(...)` (exercice 7.9).');
      expect(typeof CompteCourant).toBe('function');
    });
  });
});
