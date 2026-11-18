import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
    include: ['src/**/__tests__/**/*.test.ts', 'test/**/*.test.ts'],
    env: {
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
      SSLCOMMERZ_STORE_ID: 'test_sslcommerz_store_id',
      SSLCOMMERZ_STORE_PASSWORD: 'test_sslcommerz_store_password',
      SSLCOMMERZ_IS_SANDBOX: 'true',
    },
  },
});
