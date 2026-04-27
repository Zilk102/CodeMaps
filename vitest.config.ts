import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'electron/**/*.test.ts', 'electron/**/*.spec.ts'],
    exclude: ['node_modules', 'dist-electron', 'dist-renderer', 'release', '.release-app'],
  },
});
