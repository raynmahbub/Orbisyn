import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'providers',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
