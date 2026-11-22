import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 100000,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
});
