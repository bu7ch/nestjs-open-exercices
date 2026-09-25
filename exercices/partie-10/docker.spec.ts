import { spawnSync } from 'node:child_process';
import { dockerDisponible, lireFichier, racine } from './outils.js';

// FACULTATIF : ton image, construite et lancée pour de vrai (10.4, 10.6), et tes fichiers Compose validés
// par `docker compose config` (10.7, 10.15). Ces tests ont besoin du démon Docker : ils sont IGNORÉS
// (skipped) si `docker info` ne répond pas, dans une CI (variable CI ou GITHUB_ACTIONS), ou avec
// TESTS_DOCKER=0. TESTS_DOCKER=1 les force. La construction prend une à trois minutes (npm ci dans
// l'image) ; l'image de test est supprimée à la fin. Rien n'est jamais poussé sur un registre.

const docker = dockerDisponible();
const IMAGE = `nestjs-open-p10-test-${process.pid}`;

const lancer = (args: string[], options: { delai?: number; env?: NodeJS.ProcessEnv } = {}) => {
  const r = spawnSync('docker', args, { cwd: racine, encoding: 'utf8', timeout: options.delai ?? 60_000, env: options.env ?? process.env, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

describe.skipIf(!docker.ok)(`Partie 10 · Docker, pour de vrai (facultatif${docker.ok ? '' : ` : ignoré, ${docker.raison}`})`, () => {
  describe('10.4, 10.6 · l\'image de la marketplace', () => {
    let construite = false;
    let echec: unknown;
    beforeEach(() => {
      if (echec) throw echec;
    });
    beforeAll(() => {
      if (lireFichier('Dockerfile') === null) {
        echec = new Error('Fichier attendu : Dockerfile (exercice 10.4).');
        return;
      }
      const { code, sortie } = lancer(['build', '-t', IMAGE, '.'], { delai: 900_000 });
      if (code !== 0) echec = new Error(`\`docker build -t ${IMAGE} .\` échoue (code ${code}) :\n${sortie.slice(-3000)}`);
      else construite = true;
    }, 910_000);
    afterAll(() => {
      if (construite) lancer(['rmi', '-f', IMAGE]);
    });

    it('`docker run --rm <image> id` : pas root (uid=1000(node))', () => {
      const { sortie } = lancer(['run', '--rm', IMAGE, 'id']);
      const uid = Number(/uid=(\d+)/.exec(sortie)?.[1] ?? -1);
      expect(uid, `\`id\` affiche : ${sortie.trim()} — ajoute \`USER node\``).toBeGreaterThan(0);
    });

    it('`docker run --rm <image> ls -a` : dist, node_modules et package.json, ni src, ni tests, ni .env', () => {
      const { sortie } = lancer(['run', '--rm', IMAGE, 'ls', '-a']);
      const fichiers = sortie.split(/\s+/).filter((f) => f && f !== '.' && f !== '..');
      expect(fichiers, `le dossier de l'application contient : ${fichiers.join(', ')}`).toEqual(expect.arrayContaining(['dist', 'node_modules']));
      const enTrop = fichiers.filter((f) => !['dist', 'node_modules', 'package.json', 'package-lock.json'].includes(f));
      expect(enTrop, 'seul le résultat de la construction entre dans l\'image finale (`COPY --from=construction` de dist, node_modules et package.json)').toEqual([]);
    });

    it('lancée sans aucune variable, elle s\'arrête avec le code 1 et le message du 10.1', () => {
      const { code, sortie } = lancer(['run', '--rm', IMAGE], { delai: 60_000 });
      expect(code, `\`docker run --rm ${IMAGE}\` doit s'arrêter avec le code 1. Sortie :\n${sortie.slice(-1500)}`).toBe(1);
      expect(sortie, 'le message nomme les variables manquantes (DB_HOST…)').toContain('DB_HOST');
    });

    it('`docker image inspect` : seulement NODE_ENV=production en plus des variables de l\'image Node', () => {
      const { sortie } = lancer(['image', 'inspect', '--format', '{{json .Config.Env}}', IMAGE]);
      const env = JSON.parse(sortie.trim()) as string[];
      expect(env, '`ENV NODE_ENV=production` dans la dernière étape').toContain('NODE_ENV=production');
      const autres = env.filter((e) => !/^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|HOME|HOSTNAME)=/.test(e));
      expect(autres, 'aucune autre variable écrite dans l\'image (et surtout aucun secret : ils se lisent ici en clair)').toEqual([]);
    });

    it('la CLI de TypeORM est dans l\'image (pour le service migrations), pas celle de NestJS', () => {
      const { code } = lancer(['run', '--rm', IMAGE, 'node', 'node_modules/typeorm/cli.js', '--version']);
      expect(code, 'node_modules/.bin/typeorm doit exister dans l\'image : typeorm est une dépendance de production').toBe(0);
      const nest = lancer(['run', '--rm', IMAGE, 'ls', 'node_modules/@nestjs/cli']);
      expect(nest.code, 'les dépendances de développement (la CLI de NestJS) sont retirées : `npm prune --omit=dev`').not.toBe(0);
    });
  });

  describe('10.7, 10.15 · `docker compose config` accepte tes fichiers', () => {
    // Des valeurs factices pour les variables obligatoires (`${JWT_SECRET:?…}`) : on ne lance rien.
    const env = { ...process.env, DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'n', NOMBRE_MAX_PRODUITS: '10', JWT_SECRET: 'x'.repeat(32), JWT_REFRESH_SECRET: 'y'.repeat(32) };
    for (const fichier of ['compose.yaml', 'compose.prod.yaml']) {
      it(`${fichier} est un fichier Compose valide`, () => {
        if (lireFichier(fichier) === null) throw new Error(`Fichier attendu : ${fichier}.`);
        const { code, sortie } = lancer(['compose', '-f', fichier, '--project-name', `p10-verif-${process.pid}`, 'config', '--quiet'], { env });
        expect(code, `\`docker compose -f ${fichier} config\` refuse ton fichier :\n${sortie.slice(-1500)}`).toBe(0);
      });
    }
  });
});
