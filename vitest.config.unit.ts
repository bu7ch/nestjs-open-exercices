import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// TES tests unitaires (partie 6) : les fichiers `*.spec.ts` que tu écris à côté de ton code, dans src/.
// Lance-les avec `npm run test:unit` (c'est le `npm test` du cours), et `npm run test:cov` pour la couverture.
// Le cours écrit `include: ['**/*.spec.ts']` : ici, on se limite à src/, sinon Vitest lancerait aussi
// les tests du dépôt (exercices/) et ceux des solutions (solutions/).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
