import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'osp',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
