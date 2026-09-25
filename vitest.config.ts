import { defineConfig } from 'vitest/config';

// La base de données des tests (partie 5 et suivantes). Chaque valeur peut être surchargée par
// l'environnement (`DB_PORT=55432 npm test`). DB_NAME doit finir par `_test` : les tests refusent
// toute autre base, car ils en suppriment les tables.
const base = {
  DB_HOST: process.env.DB_HOST ?? 'localhost',
  DB_PORT: process.env.DB_PORT ?? '5432',
  DB_USER: process.env.DB_USER ?? 'marketplace',
  DB_PASSWORD: process.env.DB_PASSWORD ?? 'marketplace',
  DB_NAME: process.env.DB_NAME ?? 'marketplace_test',
};

// Redis (partie 10 : les compteurs du throttler, /sante/pret). Surchargeable aussi : `REDIS_PORT=56379 npm test`.
// Les tests qui réactivent la limitation vident cette base Redis (`FLUSHDB`), comme ceux du cours.
const redis = {
  REDIS_HOST: process.env.REDIS_HOST ?? 'localhost',
  REDIS_PORT: process.env.REDIS_PORT ?? '6379',
};

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['exercices/**/*.spec.ts'],
    fileParallelism: false,
    // Les tests changent de dossier courant (process.chdir) : il faut des processus, pas des threads.
    pool: 'forks',
    // Démarrer l'application et parler à PostgreSQL prend un peu de temps.
    testTimeout: 20000,
    hookTimeout: 30000,
    // Les variables que ta configuration exige (partie 4) et celles de la base (partie 5) : fournies
    // par les tests, jamais lues depuis ton .env.
    env: { NOMBRE_MAX_PRODUITS: '1000', NOMBRE_MAX_JOUEURS: '1000', ...base, ...redis },
    server: {
      deps: {
        // Ces paquets gardent des registres globaux (entités de `autoLoadEntities`, types GraphQL) :
        // chargés par Vitest, ils repartent à neuf à chaque redémarrage de ton application.
        inline: ['@nestjs/typeorm'],
      },
    },
  },
});
