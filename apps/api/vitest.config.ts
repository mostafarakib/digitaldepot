import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
    include: ['src/**/__tests__/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
