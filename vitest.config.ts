import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: ['./vitest.global-setup.ts'],
    // Expand brace globs explicitly — some Windows glob matchers treat `{ts,tsx}`
    // as a literal segment and then report "No test files found".
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
      'electron/**/*.test.ts',
      'electron/**/*.spec.ts',
    ],
    exclude: ['node_modules', 'dist-electron', 'dist-renderer', 'release'],
  },
});
