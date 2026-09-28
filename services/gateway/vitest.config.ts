import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'gateway',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
