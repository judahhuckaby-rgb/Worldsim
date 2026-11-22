import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// CI sets APP_VERSION (major.minor.run) so the app can tell when GitHub has something newer
const version = process.env.APP_VERSION || pkg.version;

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 100000,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
});
