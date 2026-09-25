// Vérifie que la solution de chaque partie fait passer les tests de cette partie.
// Usage : npm run verifier:solutions [numéro de partie]
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const racine = new URL('..', import.meta.url).pathname;
const demandee = process.argv[2];
const parties = readdirSync(join(racine, 'solutions'))
  .filter((d) => d.startsWith('partie-'))
  .filter((d) => !demandee || d === `partie-${demandee}`)
  .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));

if (parties.length === 0) {
  console.error('Aucune solution à vérifier.');
  process.exit(1);
}

// À partir de la partie 5, les tests ont besoin de PostgreSQL (la base de test marketplace_test).
async function verifierPostgres() {
  const p = {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'marketplace',
    password: process.env.DB_PASSWORD ?? 'marketplace',
    database: process.env.DB_NAME ?? 'marketplace_test',
  };
  const client = new pg.Client({ ...p, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    return true;
  } catch (erreur) {
    console.error(`\nPostgreSQL injoignable (${p.host}:${p.port}, base ${p.database}, utilisateur ${p.user}) : ${erreur.message || erreur.code}.`);
    console.error('Lance la base avec `docker compose up -d` à la racine du dépôt (ou règle DB_HOST, DB_PORT…), puis recommence.');
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (parties.some((p) => Number(p.slice(7)) >= 5) && !(await verifierPostgres())) process.exit(1);

let echecs = 0;
for (const partie of parties) {
  const copie = mkdtempSync(join(tmpdir(), `verif-${partie}-`));
  for (const element of ['package.json', 'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json', 'vitest.config.ts', 'exercices']) {
    if (existsSync(join(racine, element))) cpSync(join(racine, element), join(copie, element), { recursive: true });
  }
  // src/ (et, s'il y en a, les projets bonus à part comme bonus-nba/).
  for (const dossier of readdirSync(join(racine, 'solutions', partie))) {
    cpSync(join(racine, 'solutions', partie, dossier), join(copie, dossier), { recursive: true });
  }
  symlinkSync(join(racine, 'node_modules'), join(copie, 'node_modules'));

  console.log(`\n=== ${partie} ===`);
  const resultat = spawnSync('npx', ['vitest', 'run', `exercices/${partie}`], { cwd: copie, stdio: 'inherit' });
  if (resultat.status !== 0) echecs++;
  rmSync(copie, { recursive: true, force: true });
}

if (echecs > 0) {
  console.error(`\n${echecs} solution(s) en échec.`);
  process.exit(1);
}
console.log('\nToutes les solutions passent leurs tests.');
