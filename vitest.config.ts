import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['exercices/**/*.spec.ts'],
    fileParallelism: false,
    // Les tests changent de dossier courant (process.chdir) : il faut des processus, pas des threads.
    pool: 'forks',
    // Les variables que ta configuration exige (partie 4) : fournies par les tests, jamais lues depuis ton .env.
    env: { NOMBRE_MAX_PRODUITS: '1000', NOMBRE_MAX_JOUEURS: '1000' },
  },
});
