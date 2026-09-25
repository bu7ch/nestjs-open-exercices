import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // 6.14 : les fichiers e2e partagent la même base : l'un après l'autre.
    fileParallelism: false,
    // Les variables des tests, fixées ici (une variable déjà définie l'emporte sur .env.test, que
    // ConfigModule ne lit que pour compléter) : la base _test, et jamais les secrets de ton .env.
    env: {
      DB_HOST: process.env.DB_HOST ?? 'localhost',
      DB_PORT: process.env.DB_PORT ?? '5432',
      DB_USER: process.env.DB_USER ?? 'marketplace',
      DB_PASSWORD: process.env.DB_PASSWORD ?? 'marketplace',
      DB_NAME: process.env.DB_NAME ?? 'marketplace_test',
      NOMBRE_MAX_PRODUITS: process.env.NOMBRE_MAX_PRODUITS ?? '1000',
      JWT_SECRET: process.env.JWT_SECRET ?? 'secret-de-test-e2e-de-la-marketplace-32-caracteres-min',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'autre-secret-de-test-e2e-pour-les-refresh-tokens-32c',
      THROTTLE_ACTIF: process.env.THROTTLE_ACTIF ?? 'false',
      // 10.8 : les compteurs du throttler (et /sante/pret, 10.10) ont besoin de Redis.
      REDIS_HOST: process.env.REDIS_HOST ?? 'localhost',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      // 11.7 : les commandes n'expirent pas pendant les tests (sauf dans ceux qui programment leur délai).
      DELAI_PAIEMENT_MS: process.env.DELAI_PAIEMENT_MS ?? '3600000',
      // 11.13 : le secret des webhooks de test (jamais celui du prestataire).
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ?? 'whsec_secret-de-test-e2e-de-la-marketplace',
    },
  },
});
