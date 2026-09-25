import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    // 6.15 : compter TOUS les fichiers de src/, pas seulement ceux que les tests importent.
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.module.ts', 'src/**/*.dto.ts', 'src/**/*.entity.ts', 'src/data-source.ts'],
      // 6.16 : un plancher, pour ne pas reculer sans s'en rendre compte.
      thresholds: { lines: 80 },
    },
  },
});
