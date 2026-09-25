import { join } from 'node:path';
import { cartographier, compteConnecte, creerBoutique, creerProduit, donnees } from '../partie-8/outils.js';
import { MOT_DE_PASSE } from '../partie-7/outils.js';
import {
  attendrePret,
  construire,
  demarrer,
  envProduction,
  executer,
  lancerP10,
  portLibre,
  racine,
  type Construction,
  type Processus,
} from './outils.js';

// Ton application COMPILÉE, lancée comme en production : `nest build` dans une copie de ton projet, puis
// `node dist/main.js` dans un processus à part, avec NODE_ENV=production et sans AUCUN fichier .env (les
// variables viennent de l'environnement, comme dans le conteneur). C'est ce que tu fais à la main avec
// `npm run build` puis `NODE_ENV=production npm run start:prod`.
// 10.1 et 10.2 : le refus de démarrer (code 1) ; 10.2 : /docs en 404 en production ; 10.3 : les migrations
// sans .env ; 10.11 : les journaux JSON ; 10.12 : l'arrêt propre sur SIGTERM.
// À faire toi-même : la version sans @IsIn (10.2), ENOENT avant la correction (10.3), et tout ce qui se
// passe dans Docker (10.12 : `docker compose stop`, `-t 2`, les codes de sortie).

const json = (ligne: string): Record<string, any> | null => {
  try {
    const v = JSON.parse(ligne) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, any>) : null;
  } catch {
    return null;
  }
};

describe('Partie 10 · En production (exercices 10.1 à 10.3, 10.11, 10.12)', () => {
  let construction: Construction | undefined;
  const processus: Processus[] = [];

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });
  beforeAll(async () => {
    try {
      construction = await construire();
    } catch (erreur) {
      echec = erreur;
    }
  }, 240_000);
  afterAll(async () => {
    for (const p of processus) await p.arreter();
    construction?.nettoyer();
  });

  /** Lance `node dist/main.js` avec ces variables (et le suit, pour l'arrêter à la fin). */
  const lancerProcessus = (env: Record<string, string>) => {
    const p = demarrer(construction!, env);
    processus.push(p);
    return p;
  };

  /** Attend la fin du processus (au plus `delai`) ; tue le processus s'il tourne encore. */
  async function finDe(p: Processus, delai = 15_000) {
    const minuteur = new Promise<null>((r) => setTimeout(() => r(null), delai));
    const fin = await Promise.race([p.fin, minuteur]);
    if (!fin) {
      await p.arreter();
      return null;
    }
    return fin;
  }

  describe('10.1, 10.2 · une application mal configurée refuse de démarrer', () => {
    it('sans aucune variable, en production : arrêt immédiat, code 1, et un message qui nomme les variables', async () => {
      const p = lancerProcessus({ PATH: process.env.PATH ?? '', NODE_ENV: 'production', PORT: String(await portLibre()) });
      const fin = await finDe(p);
      expect(fin, `sans variables, l'application ne doit pas démarrer à moitié : elle doit s'arrêter tout de suite. Sortie :\n${p.sortie().slice(-1500)}`).not.toBeNull();
      expect(fin!.code, 'le code de sortie doit être 1 (`echo $?`)').toBe(1);
      for (const cle of ['DB_HOST', 'JWT_SECRET']) expect(p.sortie(), `le message doit nommer ${cle} (exercice 10.1)`).toContain(cle);
    }, 30_000);

    it('NODE_ENV=prod (une faute de frappe) : arrêt, code 1, et le message nomme NODE_ENV', async () => {
      const p = lancerProcessus({ ...envProduction(await portLibre()), NODE_ENV: 'prod' });
      const fin = await finDe(p);
      expect(fin, 'NODE_ENV=prod doit empêcher le démarrage : `@IsIn([\'development\', \'production\', \'test\'])` (exercice 10.1)').not.toBeNull();
      expect(fin!.code, 'le code de sortie doit être 1').toBe(1);
      expect(p.sortie(), 'le message doit nommer NODE_ENV').toMatch(/NODE_ENV \(isIn\)/);
    }, 30_000);
  });

  describe('une application bien configurée, en production', () => {
    let p: Processus;
    let bearer = '';
    beforeAll(async () => {
      try {
        // Les tables de la base de test, créées d'après tes entités (en production, synchronize est coupé).
        const lancee = await lancerP10();
        await lancee.fermer();
        p = lancerProcessus(envProduction(await portLibre()));
        await attendrePret(p);
        const email = `prod.${process.pid}@exemple.fr`;
        const inscription = await fetch(`${p.url}/api/auth/inscription`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE }) });
        if (inscription.status !== 201) throw new Error(`POST /api/auth/inscription a répondu ${inscription.status} (application compilée, en production) : ${await inscription.text()}`);
        const connexion = await fetch(`${p.url}/api/auth/connexion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'essai-10-11' },
          body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE }),
        });
        bearer = `Bearer ${donnees<{ accessToken: string }>(await connexion.json()).accessToken}`;
      } catch (erreur) {
        echec = erreur;
      }
    }, 60_000);

    it('10.2 · /docs et /docs-json répondent 404, et l\'API fonctionne', async () => {
      const docs = await fetch(`${p.url}/docs`, { redirect: 'manual' });
      expect(docs.status, 'avec NODE_ENV=production, la documentation n\'est pas publiée : `if (!production) configurerSwagger(app)` dans main.ts').toBe(404);
      expect((await fetch(`${p.url}/docs-json`)).status, '/docs-json non plus').toBe(404);
      const produits = await fetch(`${p.url}/api/produits`, { headers: { Authorization: bearer } });
      expect(produits.status, 'GET /api/produits fonctionne toujours').toBe(200);
    });

    it('10.11 · les journaux sont en JSON, et la ligne d\'une requête porte ses paramètres', async () => {
      await fetch(`${p.url}/api/produits`, { headers: { Authorization: bearer, 'X-Request-Id': 'essai-10-11' } });
      let ligne: Record<string, any> | null | undefined;
      for (let i = 0; i < 40 && !ligne; i++) {
        ligne = p.lignes().map(json).find((l) => l?.params?.requeteId === 'essai-10-11' && l?.params?.url === '/api/produits');
        if (!ligne) await new Promise((r) => setTimeout(r, 50));
      }
      const demarrage = p.lignes().find((l) => l.includes('successfully started'));
      expect(demarrage, 'le message de démarrage de NestJS doit être écrit').toBeDefined();
      expect(
        json(demarrage!),
        `en production, les journaux sont en JSON : \`NestFactory.create(AppModule, { logger: creerLogger(production) })\` dans main.ts. Ligne lue : ${demarrage}`,
      ).not.toBeNull();
      expect(ligne, `aucune ligne JSON avec \`params.requeteId: "essai-10-11"\` pour GET /api/produits. Journal :\n${p.lignes().slice(-5).join('\n')}`).toBeTruthy();
      expect(ligne).toMatchObject({ level: 'log', context: 'HTTP', params: { requeteId: 'essai-10-11', methode: 'GET', url: '/api/produits', statut: 200 } });
      expect(ligne!.params.dureeMs).toEqual(expect.any(Number));
    });

    it('10.12 · SIGTERM : la requête en cours va au bout (200, base lue à la fin), puis le processus s\'arrête', async () => {
      const routes = (await cartographier()).routes;
      expect(routes.some((r) => r.methode === 'GET' && r.chemin === 'api/demo/longue'), 'ajoute `GET /api/demo/longue` : attend 5 secondes, puis compte les produits en base (exercice 10.12)').toBe(true);
      const avecArret = (await cartographier()).exports.some((e) => typeof e.valeur === 'function' && typeof (e.valeur as { prototype?: { beforeApplicationShutdown?: unknown } }).prototype?.beforeApplicationShutdown === 'function');
      expect(avecArret, 'ajoute un hook `beforeApplicationShutdown(signal)` qui journalise la réception du signal (dans AppModule, comme le cours)').toBe(true);

      const debut = Date.now();
      const requete = fetch(`${p.url}/api/demo/longue`, { headers: { Authorization: bearer } }).then(
        async (r) => ({ statut: r.status, corps: (await r.json().catch(() => null)) as unknown }),
        (erreur: Error) => ({ statut: 0, corps: String(erreur.cause ?? erreur.message) }),
      );
      await new Promise((r) => setTimeout(r, 1000));
      const lignesAvant = p.lignes().length;
      p.signaler('SIGTERM');
      const reponse = await requete;
      expect(
        reponse.statut,
        `la requête en cours a été coupée (${JSON.stringify(reponse.corps)}) : sans \`app.enableShutdownHooks()\` dans main.ts, SIGTERM tue node sur-le-champ`,
      ).toBe(200);
      const contenu = donnees<{ termine?: unknown; produits?: unknown }>(reponse.corps);
      expect(contenu?.termine, 'la route répond `{ termine: true, produits: N }`').toBe(true);
      expect(Date.now() - debut, 'la route attend 5 secondes avant de répondre').toBeGreaterThanOrEqual(4500);
      const fin = await finDe(p, 15_000);
      expect(fin, 'après la dernière réponse, le processus doit s\'arrêter tout seul').not.toBeNull();
      expect(fin!.code === 0 || fin!.signal === 'SIGTERM', `arrêt propre attendu (code 0, ou le SIGTERM que NestJS se renvoie hors conteneur) ; obtenu : code ${fin!.code}, signal ${fin!.signal}`).toBe(true);
      const apres = p.lignes().slice(lignesAvant).filter((l) => json(l)?.context !== 'HTTP' && !/"context":"HTTP"/.test(l));
      expect(apres.length, `ton hook \`beforeApplicationShutdown\` doit écrire un message à la réception du signal (\`this.logger.log(\\\`Signal \${signal} reçu…\\\`)\`). Journal après le signal :\n${p.lignes().slice(lignesAvant).join('\n')}`).toBeGreaterThan(0);
    }, 30_000);

    it('10.12 · la route longue compte les produits en base', async () => {
      const lancee = await lancerP10();
      try {
        const vendeur = await compteConnecte(lancee, 'vendeur');
        const boutique = await creerBoutique(lancee, vendeur.id, 'Boutique 10.12');
        for (let i = 0; i < 3; i++) await creerProduit(lancee, boutique);
        const r = await lancee.http().get('/api/demo/longue').set('Authorization', vendeur.bearer);
        expect(r.status, `GET /api/demo/longue a répondu ${r.status} : ${JSON.stringify(r.body).slice(0, 300)}`).toBe(200);
        expect(donnees(r.body), '`{ termine: true, produits: N }`, N lu en base À LA FIN (`SELECT count(*) …`)').toEqual({ termine: true, produits: 3 });
      } finally {
        await lancee.fermer();
      }
    }, 30_000);
  });

  describe('10.3 · les migrations sans fichier .env', () => {
    it('`typeorm migration:show -d dist/data-source.js` fonctionne sans .env, avec les variables DB_*', async () => {
      const env = envProduction(0);
      const cli = join(racine, 'node_modules/typeorm/cli.js');
      const { code, sortie } = await executer(process.execPath, [cli, 'migration:show', '-d', 'dist/data-source.js'], { cwd: construction!.dossier, env, delai: 60_000 });
      expect(
        code,
        /ENOENT/.test(sortie)
          ? `data-source.ts exige un fichier .env (ENOENT) : \`if (existsSync('.env')) process.loadEnvFile();\` (exercice 10.3). Sortie :\n${sortie.slice(-800)}`
          : `\`npx typeorm migration:show -d dist/data-source.js\` échoue sans .env. Sortie :\n${sortie.slice(-1200)}`,
      ).toBe(0);
    }, 70_000);
  });
});
