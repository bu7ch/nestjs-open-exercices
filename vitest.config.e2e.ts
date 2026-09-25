import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// TES tests de bout en bout (partie 6) : les fichiers `*.e2e-spec.ts` du dossier test/.
// Lance-les avec `npm run test:e2e`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
  },
});
