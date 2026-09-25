import {
  commandeDe,
  commandeService,
  dependancesDe,
  duree,
  environnementDe,
  estIgnore,
  lireDockerfile,
  lireFichier,
  lireWorkflows,
  lireYaml,
  portsDe,
  roles,
  testDeSante,
  variablesEnv,
  type Etape,
  type Roles,
} from './outils.js';

// Tes fichiers de déploiement, lus et analysés SANS rien exécuter (ni Docker, ni GitHub) : le Dockerfile
// et le .dockerignore (10.4 à 10.6), compose.yaml (10.7, 10.10, 10.12), le workflow GitHub Actions
// (10.13, 10.14) et compose.prod.yaml (10.15). Les noms de tes services sont libres : la base est celle
// dont l'image est PostgreSQL, Redis celle dont l'image est Redis, les migrations celle dont la commande
// contient `migration:run`, et l'API le service restant (`api` de préférence).
// Construire l'image et la lancer vraiment : docker.spec.ts (ignoré sans Docker, et dans la CI).
// À faire toi-même : les tailles de `docker images`, le cache (`CACHED`, les temps, la taille du contexte),
// `Dockerfile.fuite` et `docker history` (10.6), tout ce qui se lance avec `docker compose` (10.7 à 10.12),
// le push et l'onglet Actions, actionlint, la migration fautive (10.13), GHCR, `docker pull`, la pull request
// (10.14), le lancement de compose.prod.yaml (10.15).

const INDICE_DOCKERFILE = 'Écris le Dockerfile multi-étapes de la section b, à la racine du dépôt (exercice 10.4).';

/** Ton Dockerfile, découpé en étapes. */
function dockerfile(): Etape[] {
  const contenu = lireFichier('Dockerfile');
  if (contenu === null) throw new Error(`Fichier attendu : Dockerfile. ${INDICE_DOCKERFILE}`);
  const etapes = lireDockerfile(contenu);
  if (etapes.length === 0) throw new Error(`Ton Dockerfile ne contient aucun \`FROM\`. ${INDICE_DOCKERFILE}`);
  return etapes;
}

const SECRET = /(SECRET|PASSWORD|PASSWD|MOT_DE_PASSE|TOKEN|API_?KEY|PRIVATE|CREDENTIAL)/i;

// --- 10.4 à 10.6 : l'image ------------------------------------------------------------------------

describe('Partie 10 · L\'image Docker (exercices 10.4 à 10.6)', () => {
  describe('10.4 · le Dockerfile multi-étapes', () => {
    it('au moins deux étapes : une qui construit, une (toute neuve) qui exécute', () => {
      const etapes = dockerfile();
      expect(etapes.length, 'un Dockerfile multi-étapes : deux `FROM` (le premier nommé, `FROM … AS construction`)').toBeGreaterThanOrEqual(2);
      const finale = etapes.at(-1)!;
      const depuis = finale.instructions.filter((i) => i.nom === 'COPY' && /--from=/.test(i.args));
      expect(depuis.length, 'la dernière étape récupère le résultat de la première : `COPY --from=construction /app/dist ./dist` (et node_modules)').toBeGreaterThan(0);
      expect(
        depuis.some((i) => /\bdist\b/.test(i.args)),
        'la dernière étape copie le JavaScript compilé : `COPY --from=construction /app/dist ./dist`',
      ).toBe(true);
    });

    it('la dernière étape n\'emporte pas le code source : pas de `COPY . .` (seulement ce qui vient de la construction)', () => {
      const finale = dockerfile().at(-1)!;
      const copiesDuContexte = finale.instructions.filter((i) => ['COPY', 'ADD'].includes(i.nom) && !/--from=/.test(i.args));
      const tropLarge = copiesDuContexte.filter((i) => {
        const sources = i.args.split(/\s+/).filter((m) => !m.startsWith('--')).slice(0, -1);
        return sources.some((s) => ['.', './', '*', 'src', 'src/', './src'].includes(s));
      });
      expect(tropLarge.map((i) => `ligne ${i.ligne} : ${i.nom} ${i.args}`), 'le code TypeScript, les tests et les outils de construction restent dans la première étape').toEqual([]);
    });

    it('l\'application ne tourne pas en administrateur (USER non root dans la dernière étape)', () => {
      const finale = dockerfile().at(-1)!;
      const users = finale.instructions.filter((i) => i.nom === 'USER');
      expect(users.length, 'ajoute `USER node` dans la dernière étape (l\'utilisateur que prévoit l\'image officielle de Node)').toBeGreaterThan(0);
      const dernier = users.at(-1)!.args.split(':')[0]!.trim();
      expect(['root', '0'], `\`USER ${dernier}\` : c'est encore l'administrateur. \`USER node\` (uid 1000)`).not.toContain(dernier);
      const apres = finale.instructions.slice(finale.instructions.indexOf(users.at(-1)!) + 1);
      expect(apres.some((i) => i.nom === 'RUN'), 'le `USER` vient après les `RUN` de l\'étape (sinon ils échoueraient sans droits), juste avant `CMD`').toBe(false);
    });

    it('le conteneur lance `node` directement (pas `npm`), en production', () => {
      const finale = dockerfile().at(-1)!;
      const lancement = finale.instructions.filter((i) => i.nom === 'CMD' || i.nom === 'ENTRYPOINT');
      expect(lancement.length, 'termine par `CMD ["node", "dist/main.js"]`').toBeGreaterThan(0);
      const texte = lancement.map((i) => commandeDe(i.args).texte).join(' ');
      expect(texte, '`CMD ["node", "dist/main.js"]` : avec `npm`, c\'est npm qui reçoit SIGTERM, sort avec le code 1 et écrit des lignes qui ne sont pas du JSON (section d)').not.toMatch(/\b(npm|yarn|pnpm|npx)\b/);
      expect(texte, 'le conteneur démarre dist/main.js').toMatch(/dist\/main(\.js)?\b/);
      const env = variablesEnv(finale.instructions);
      expect(env.find((v) => v.cle === 'NODE_ENV')?.valeur, '`ENV NODE_ENV=production` dans la dernière étape : la seule variable qu\'on écrit dans l\'image').toBe('production');
    });

    it('le .dockerignore écarte node_modules, dist et tous les .env', () => {
      const ignore = lireFichier('.dockerignore');
      expect(ignore, 'Fichier attendu à la racine : .dockerignore (exercice 10.4)').not.toBeNull();
      for (const chemin of ['node_modules', 'dist', '.env', '.env.production']) {
        expect(estIgnore(ignore!, chemin), `le .dockerignore doit écarter \`${chemin}\`${chemin.startsWith('.env') ? ' (une ligne `.env*` : aucun secret ne part dans l\'image, même par un `COPY . .`)' : ''}`).toBe(true);
      }
      for (const chemin of ['src/main.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json']) {
        expect(estIgnore(ignore!, chemin), `\`${chemin}\` est nécessaire à la construction : ne l'écarte pas`).toBe(false);
      }
    });
  });

  describe('10.5 · le cache des couches', () => {
    it('dans l\'étape de construction, package.json et package-lock.json sont copiés, et installés, AVANT le reste du code', () => {
      const etapes = dockerfile();
      const construction = etapes.find((e) => e.instructions.some((i) => i.nom === 'RUN' && /\b(npm (ci|install|i)|yarn|pnpm (i|install))\b/.test(i.args)));
      expect(construction, 'l\'étape de construction installe les dépendances : `RUN npm ci`').toBeDefined();
      const liste = construction!.instructions;
      const installation = liste.findIndex((i) => i.nom === 'RUN' && /\b(npm (ci|install|i)|yarn|pnpm (i|install))\b/.test(i.args));
      const avant = liste.slice(0, installation).filter((i) => ['COPY', 'ADD'].includes(i.nom) && !/--from=/.test(i.args));
      const sources = avant.flatMap((i) => i.args.split(/\s+/).filter((m) => !m.startsWith('--')).slice(0, -1));
      expect(
        sources.filter((s) => !/^(\.\/)?package(-lock)?\*?\.json$|^(\.\/)?package\*\.json$|^(\.\/)?(\.npmrc|npm-shrinkwrap\.json)$/.test(s)),
        '`COPY . .` avant `RUN npm ci` : n\'importe quelle modification de src/ relancerait toute l\'installation. Copie d\'abord `package.json package-lock.json ./`, installe, puis `COPY . .`',
      ).toEqual([]);
      expect(sources.some((s) => /package(\*|-lock)?\.json/.test(s)), 'copie `package.json` et `package-lock.json` avant `RUN npm ci`').toBe(true);
      const apres = liste.slice(installation + 1).some((i) => ['COPY', 'ADD'].includes(i.nom) && !/--from=/.test(i.args));
      expect(apres, 'le code arrive APRÈS l\'installation : `COPY . .`, puis `RUN npm run build`').toBe(true);
    });
  });

  describe('10.6 · aucun secret dans l\'image', () => {
    it('aucun `ENV` ni `ARG` ne porte un secret (ils se lisent avec `docker image inspect` et `docker history`)', () => {
      const trouves: string[] = [];
      for (const etape of dockerfile()) {
        for (const nom of ['ENV', 'ARG']) {
          for (const v of variablesEnv(etape.instructions, nom)) {
            if (SECRET.test(v.cle) || /^(JWT|DB_)/.test(v.cle)) trouves.push(`ligne ${v.ligne} : ${nom} ${v.cle}`);
          }
        }
      }
      expect(trouves, 'les secrets (JWT_SECRET, DB_PASSWORD…) sont fournis au démarrage du conteneur (Compose, section c), jamais écrits dans l\'image').toEqual([]);
    });
  });
});

// --- 10.7, 10.10, 10.12 : compose.yaml ------------------------------------------------------------

const INDICE_COMPOSE = 'Complète le compose.yaml du dépôt avec les services redis, migrations et api de la section c (exercice 10.7).';

function compose(): Roles {
  const r = roles(lireYaml('compose.yaml', INDICE_COMPOSE));
  const manque = [
    !r.base && 'la base (image postgres)',
    !r.redis && 'Redis (image redis:7-alpine)',
    !r.migrations && 'les migrations (commande `node_modules/.bin/typeorm migration:run -d dist/data-source.js`)',
    !r.api && 'l\'API (`build: .`)',
  ].filter(Boolean);
  if (manque.length > 0) throw new Error(`compose.yaml : services introuvables : ${manque.join(', ')}. ${INDICE_COMPOSE}`);
  return r;
}

describe('Partie 10 · Docker Compose (exercices 10.7, 10.10, 10.12)', () => {
  describe('10.7 · toute la marketplace en une commande', () => {
    it('quatre services : la base, Redis, les migrations et l\'API, construite depuis le Dockerfile', () => {
      const r = compose();
      expect(r.services[r.api!]!.build, `le service \`${r.api}\` est construit avec le Dockerfile de l'exercice 10.4 : \`build: .\``).toBeDefined();
      expect(r.services[r.migrations!]!.build ?? r.services[r.migrations!]!.image, `le service \`${r.migrations}\` utilise la même image : \`build: .\``).toBeDefined();
      expect(portsDe(r.services[r.api!]).some((p) => /(^|:)3000$/.test(p)), `publie le port de l'API : \`ports: ["3000:3000"]\``).toBe(true);
    });

    it('la base et Redis ont un healthcheck (pg_isready, redis-cli ping)', () => {
      const r = compose();
      expect(testDeSante(r.services[r.base!]), `ajoute un healthcheck au service \`${r.base}\` : \`test: ["CMD-SHELL", "pg_isready -U $\${POSTGRES_USER} -d $\${POSTGRES_DB}"]\``).toMatch(/pg_isready/);
      expect(testDeSante(r.services[r.redis!]), `ajoute un healthcheck au service \`${r.redis}\` : \`test: ["CMD", "redis-cli", "ping"]\``).toMatch(/redis-cli.*ping|ping/);
    });

    it('la base garde le volume docker/initdb (qui crée marketplace_test)', () => {
      const r = compose();
      const volumes = (r.services[r.base!]!.volumes ?? []).map((v: unknown) => (typeof v === 'string' ? v : `${(v as { source?: string }).source}:${(v as { target?: string }).target}`));
      expect(volumes.some((v: string) => /docker\/initdb.*docker-entrypoint-initdb\.d/.test(v)), 'garde `./docker/initdb:/docker-entrypoint-initdb.d:ro` : les tests ont besoin de marketplace_test').toBe(true);
    });

    it('les migrations : la CLI de TypeORM (pas `npm run`), une fois la base prête', () => {
      const r = compose();
      const commande = commandeService(r.services[r.migrations!]);
      expect(commande, '`npm run migration:run` recompile avec la CLI de NestJS, absente de l\'image (`sh: nest: not found`) : `["node_modules/.bin/typeorm", "migration:run", "-d", "dist/data-source.js"]`').not.toMatch(/\bnpm\b|\bnest\b/);
      expect(commande, 'les migrations compilées : `-d dist/data-source.js`').toMatch(/dist\/data-source\.js/);
      expect(dependancesDe(r.services[r.migrations!])[r.base!], `le service \`${r.migrations}\` attend que la base soit PRÊTE : \`depends_on: { ${r.base}: { condition: service_healthy } }\``).toBe('service_healthy');
    });

    it('l\'API démarre quand la base et Redis sont prêts, et les migrations terminées avec succès', () => {
      const r = compose();
      const d = dependancesDe(r.services[r.api!]);
      const aide = (service: string, condition: string) => `\`depends_on: { ${service}: { condition: ${condition} } }\` dans le service \`${r.api}\` (\`depends_on\` seul n'attend que le lancement du conteneur)`;
      expect(d[r.base!], aide(r.base!, 'service_healthy')).toBe('service_healthy');
      expect(d[r.redis!], aide(r.redis!, 'service_healthy')).toBe('service_healthy');
      expect(d[r.migrations!], aide(r.migrations!, 'service_completed_successfully')).toBe('service_completed_successfully');
    });

    it('les variables de l\'API : production, la base et Redis par leur nom de service, les secrets lus dans .env', () => {
      const r = compose();
      const env = environnementDe(r.services[r.api!]);
      expect(env.NODE_ENV, '`NODE_ENV: production`').toBe('production');
      expect(env.DB_HOST, `dans un conteneur, \`localhost\` est le conteneur lui-même : \`DB_HOST: ${r.base}\` (le nom du service)`).toBe(r.base);
      expect(env.REDIS_HOST, `\`REDIS_HOST: ${r.redis}\``).toBe(r.redis);
      for (const cle of ['DB_USER', 'DB_PASSWORD', 'DB_NAME', 'NOMBRE_MAX_PRODUITS']) expect(env[cle], `l'API a besoin de ${cle}`).toBeTruthy();
      for (const cle of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
        expect(env[cle], `l'API a besoin de ${cle}`).toBeTruthy();
        expect(env[cle], `${cle} ne s'écrit pas dans compose.yaml (il est dans le dépôt) : \`${cle}: \${${cle}:?${cle} manquant dans .env}\``).toMatch(/\$\{/);
      }
    });

    it('l\'API a un healthcheck qui interroge sa route de santé', () => {
      const r = compose();
      expect(testDeSante(r.services[r.api!]), 'un healthcheck pour l\'API : `["CMD", "node", "-e", "fetch(\'http://localhost:3000/sante\')…"]` (l\'image Alpine n\'a pas curl)').toMatch(/\/sante/);
    });
  });

  it('10.10 · le healthcheck de l\'API interroge /sante/pret', () => {
    const r = compose();
    expect(testDeSante(r.services[r.api!]), 'remets `/sante/pret` dans le healthcheck de l\'API (au 10.7, `/sante` suffisait)').toMatch(/\/sante\/pret/);
  });

  it('10.12 · stop_grace_period : au moins 30 secondes pour finir les requêtes en cours', () => {
    const r = compose();
    const delai = duree(r.services[r.api!]!.stop_grace_period);
    expect(Number.isNaN(delai) ? 0 : delai, `ajoute \`stop_grace_period: 30s\` au service \`${r.api}\` (Docker envoie SIGKILL 10 s après SIGTERM, par défaut)`).toBeGreaterThanOrEqual(30);
  });
});

// --- 10.13, 10.14 : le workflow --------------------------------------------------------------------

const INDICE_CI = 'Complète le workflow `.github/workflows/ci.yml` du dépôt (exercice 10.13).';
const ETAPE_TESTS = /\bnpm (test|t|run test(:[\w-]+)?)\b|\bvitest\b/;

type Job = { services?: Record<string, { image?: string; options?: string }>; env?: Record<string, unknown>; steps?: { run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, unknown> }[]; needs?: string | string[]; if?: string; permissions?: Record<string, string> | string };

/** Le job qui lance les tests des exercices (une étape `npm test` ou `npm run test:…`), et son workflow. */
function jobDesTests(): { fichier: string; workflow: any; nom: string; job: Job } {
  const workflows = lireWorkflows();
  if (workflows.length === 0) throw new Error(`Aucun workflow dans .github/workflows/. ${INDICE_CI}`);
  for (const { fichier, contenu } of workflows) {
    for (const [nom, job] of Object.entries((contenu?.jobs ?? {}) as Record<string, Job>)) {
      if ((job.steps ?? []).some((s) => ETAPE_TESTS.test(String(s.run ?? '')))) return { fichier, workflow: contenu, nom, job };
    }
  }
  throw new Error(`Aucun job ne lance les tests (\`npm test\`, ou \`npm run test:partie-10\`) dans .github/workflows/. ${INDICE_CI}`);
}

describe('Partie 10 · Intégration et livraison continues (exercices 10.13 et 10.14)', () => {
  describe('10.13 · la CI de ta marketplace', () => {
    it('le job des tests a deux services avec healthcheck : PostgreSQL (base _test) et Redis', () => {
      const { nom, job } = jobDesTests();
      const services = Object.values(job.services ?? {});
      const postgres = services.find((s) => /postgres/i.test(String(s?.image)));
      expect(postgres, `le job \`${nom}\` doit démarrer un service PostgreSQL (\`image: postgres:16\`) : les tests ont besoin de la base`).toBeDefined();
      expect(String(postgres?.options ?? ''), 'un healthcheck pour PostgreSQL : `options: --health-cmd "pg_isready …"`').toMatch(/--health-cmd/);
      const redis = services.find((s) => /redis/i.test(String(s?.image)));
      expect(redis, `ajoute au job \`${nom}\` un service \`redis\` (\`image: redis:7-alpine\`, \`ports: [6379:6379]\`)`).toBeDefined();
      expect(String(redis?.options ?? ''), 'un healthcheck pour Redis : `options: --health-cmd "redis-cli ping" …`').toMatch(/--health-cmd/);
    });

    it('REDIS_HOST (et la base de test) dans les variables du job', () => {
      const { nom, workflow, job } = jobDesTests();
      const etape = (job.steps ?? []).find((s) => ETAPE_TESTS.test(String(s.run ?? '')));
      const env = { ...(workflow?.env ?? {}), ...(job.env ?? {}), ...(etape?.env ?? {}) } as Record<string, unknown>;
      expect(env.REDIS_HOST, `ajoute \`REDIS_HOST: localhost\` aux variables du job \`${nom}\``).toBe('localhost');
      expect(String(env.DB_NAME ?? ''), 'DB_NAME : une base dont le nom finit par _test').toMatch(/_test$/);
    });

    it('avant les tests : `npm run build`, puis les migrations sur la base vide', () => {
      const { nom, job } = jobDesTests();
      const etapes = (job.steps ?? []).map((s) => String(s.run ?? ''));
      const tests = etapes.findIndex((r) => ETAPE_TESTS.test(r));
      const build = etapes.findIndex((r) => /\bnpm run build\b|\bnest build\b|\btsc\b/.test(r));
      const migrations = etapes.findIndex((r) => /migration:run/.test(r));
      expect(build, `ajoute une étape \`- run: npm run build\` au job \`${nom}\` (la compilation vérifie les types, ce que Vitest ne fait pas)`).toBeGreaterThanOrEqual(0);
      expect(build, '`npm run build` AVANT les tests').toBeLessThan(tests);
      expect(migrations, `ajoute une étape qui exécute les migrations sur la base vide : \`- run: npx typeorm migration:run -d dist/data-source.js\``).toBeGreaterThanOrEqual(0);
      expect(migrations, 'les migrations AVANT les tests').toBeLessThan(tests);
      if (/dist\//.test(etapes[migrations]!)) expect(migrations, 'les migrations lisent dist/ : l\'étape vient après `npm run build`').toBeGreaterThan(build);
    });

    it('actions/checkout et actions/setup-node dans une version récente (plus de Node.js 20)', () => {
      const utilisees = lireWorkflows().flatMap(({ contenu }) => Object.values((contenu?.jobs ?? {}) as Record<string, Job>).flatMap((j) => (j.steps ?? []).map((s) => String(s.uses ?? ''))));
      for (const action of ['actions/checkout', 'actions/setup-node']) {
        for (const u of utilisees.filter((x) => x.startsWith(`${action}@`))) {
          const majeure = Number(/@v(\d+)/.exec(u)?.[1] ?? 99);
          expect(majeure, `${u} vise Node.js 20, abandonné par GitHub : passe en \`${action}@v7\``).toBeGreaterThanOrEqual(5);
        }
      }
    });
  });

  describe('10.14 · publier l\'image', () => {
    /** Le job qui construit et pousse l'image. */
    function jobImage(): { nom: string; job: Job; workflow: any; tests: string } {
      const { nom: tests, workflow } = jobDesTests();
      for (const [nom, job] of Object.entries((workflow?.jobs ?? {}) as Record<string, Job>)) {
        const pousse = (job.steps ?? []).some((s) => (/docker\/build-push-action/.test(String(s.uses)) && [true, 'true'].includes(s.with?.push as never)) || /\bdocker (image )?push\b/.test(String(s.run ?? '')));
        if (pousse) return { nom, job, workflow, tests };
      }
      throw new Error('Aucun job ne construit et ne pousse l\'image : ajoute le job `image` de la section e (`docker/build-push-action` avec `push: true`), exercice 10.14.');
    }

    it('un job `image` qui dépend du job des tests (`needs`)', () => {
      const { nom, job, tests } = jobImage();
      expect([job.needs ?? []].flat(), `\`needs: ${tests}\` dans le job \`${nom}\` : l'image n'est construite que si les tests ont réussi`).toContain(tests);
    });

    it('seulement pour un push (pas pour une pull request)', () => {
      const { nom, job, workflow } = jobImage();
      const declencheurs = workflow?.on ?? workflow?.true;
      const pullRequests = typeof declencheurs === 'string' ? declencheurs === 'pull_request' : Array.isArray(declencheurs) ? declencheurs.includes('pull_request') : !!declencheurs && 'pull_request' in declencheurs;
      if (!pullRequests) return;
      expect(String(job.if ?? ''), `le workflow se lance aussi pour les pull requests : \`if: github.event_name == 'push'\` sur le job \`${nom}\``).toMatch(/push|refs\/heads/);
    });

    it('GHCR : `packages: write`, connexion avec le jeton GITHUB_TOKEN, étiquettes `latest` et `sha-…`', () => {
      const { nom, job, workflow } = jobImage();
      const permissions = { ...(typeof workflow?.permissions === 'object' ? workflow.permissions : {}), ...(typeof job.permissions === 'object' ? job.permissions : {}) } as Record<string, string>;
      expect(permissions.packages ?? (job.permissions === 'write-all' ? 'write' : undefined), `\`permissions: { contents: read, packages: write }\` dans le job \`${nom}\` : écrire sur GHCR`).toBe('write');
      const etapes = job.steps ?? [];
      const connexion = etapes.find((s) => /docker\/login-action/.test(String(s.uses)));
      expect(String(connexion?.with?.registry ?? ''), 'connecte-toi à GHCR : `docker/login-action` avec `registry: ghcr.io`').toBe('ghcr.io');
      expect(String(connexion?.with?.password ?? ''), 'le mot de passe est le jeton de l\'exécution, jamais écrit en clair : `${{ secrets.GITHUB_TOKEN }}`').toMatch(/\$\{\{\s*secrets\./);
      const texte = etapes.map((s) => `${JSON.stringify(s.with ?? {})} ${s.run ?? ''}`).join(' ');
      expect(texte, 'une étiquette par commit : `type=sha` (docker/metadata-action), ou `${{ github.sha }}`').toMatch(/type=sha|github\.sha/);
      expect(texte, 'et l\'étiquette `latest`').toMatch(/latest/);
    });
  });
});

// --- 10.15 : compose.prod.yaml ----------------------------------------------------------------------

const INDICE_PROD = 'Écris compose.prod.yaml à la racine du dépôt (exercice 10.15).';

describe('Partie 10 · Une répétition de déploiement (exercice 10.15)', () => {
  function prod(): Roles {
    const r = roles(lireYaml('compose.prod.yaml', INDICE_PROD));
    const manque = [!r.base && 'la base', !r.redis && 'Redis', !r.migrations && 'les migrations', !r.api && 'l\'API'].filter(Boolean);
    if (manque.length > 0) throw new Error(`compose.prod.yaml : services introuvables : ${manque.join(', ')}. ${INDICE_PROD}`);
    return r;
  }

  it('l\'API et les migrations utilisent l\'image publiée (`image:`), pas `build`, et son nom est en minuscules', () => {
    const r = prod();
    for (const service of [r.api!, r.migrations!]) {
      const s = r.services[service]!;
      expect(s.build, `sur le serveur, on ne construit rien : retire \`build\` du service \`${service}\``).toBeUndefined();
      expect(String(s.image ?? ''), `\`image: ghcr.io/<ton-compte>/<ton-depot>:latest\` pour le service \`${service}\` (l'image de l'exercice 10.14)`).toMatch(/\//);
      const nom = String(s.image).replace(/\$\{[^}]*\}/g, '').split('@')[0]!.replace(/:[^/]*$/, '');
      expect(nom, `un nom d'image Docker s'écrit en minuscules : \`${s.image}\``).toBe(nom.toLowerCase());
    }
  });

  it('ni la base ni Redis ne publient de port', () => {
    const r = prod();
    for (const service of [r.base!, r.redis!]) {
      expect(portsDe(r.services[service]), `retire \`ports\` du service \`${service}\` : seuls les conteneurs du réseau privé doivent le joindre`).toEqual([]);
    }
  });

  it('l\'API n\'est publiée que sur 127.0.0.1:3000 (derrière le reverse proxy)', () => {
    const r = prod();
    const ports = portsDe(r.services[r.api!]);
    expect(ports.length, '`ports: ["127.0.0.1:3000:3000"]`').toBeGreaterThan(0);
    for (const p of ports) expect(p, '`127.0.0.1:3000:3000` : sur le serveur lui-même seulement, pas sur Internet').toMatch(/^127\.0\.0\.1:3000:3000(\/tcp)?$/);
  });

  it('stop_grace_period de 30 s, et les secrets lus dans le fichier de valeurs de production', () => {
    const r = prod();
    const delai = duree(r.services[r.api!]!.stop_grace_period);
    expect(Number.isNaN(delai) ? 0 : delai, '`stop_grace_period: 30s` sur l\'API').toBeGreaterThanOrEqual(30);
    const env = { ...environnementDe(r.services[r.api!]), ...environnementDe(r.services[r.migrations!]) };
    for (const cle of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DB_PASSWORD']) {
      expect(env[cle] ?? '', `${cle} vient de \`--env-file production.env\` : \`${cle}: \${${cle}:?…}\`, jamais en clair dans le fichier`).toMatch(/\$\{/);
    }
    const base = environnementDe(r.services[r.base!]);
    expect(base.POSTGRES_PASSWORD ?? '', 'le mot de passe de la base de production vient aussi du fichier de valeurs : `POSTGRES_PASSWORD: ${DB_PASSWORD}`').toMatch(/\$\{/);
  });

  it('comme compose.yaml : healthchecks et démarrage dans l\'ordre', () => {
    const r = prod();
    expect(testDeSante(r.services[r.base!]), 'le healthcheck de la base (pg_isready)').toBeTruthy();
    expect(testDeSante(r.services[r.api!]), 'le healthcheck de l\'API (/sante/pret)').toMatch(/\/sante\/pret/);
    const d = dependancesDe(r.services[r.api!]);
    expect(d[r.migrations!], 'l\'API attend la fin des migrations : `condition: service_completed_successfully`').toBe('service_completed_successfully');
    expect(d[r.base!], 'l\'API attend la base : `condition: service_healthy`').toBe('service_healthy');
  });
});
