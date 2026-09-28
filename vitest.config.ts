import { defineConfig } from 'vitest/config';

/**
 * Root test configuration.
 *
 * Every workspace is a Vitest project with its own environment (node for the
 * domain packages, jsdom for the web client), so a single `npm test` runs the
 * whole monorepo with the right runtime per package.
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'services/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'services/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/testing/**',
        '**/index.ts',
        'packages/contracts/src/**',
        'packages/core/src/model.ts',
        'packages/core/src/ports.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
