// Vite configuration of the renderer: React and Tailwind plugins, the `@` alias for src/ and the
// fixed dev-server port that the Electron dev script waits for.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
  },
});
