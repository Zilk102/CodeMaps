import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'electron/**/*.test.ts', 'electron/**/*.spec.ts'],
    exclude: ['node_modules', 'dist-electron', 'dist-renderer', 'release', '.release-app'],
  },
});
