import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync } from 'node:fs';

// Resolve "three" to the vendored copy so Vite and Live Server run the exact same files.
const vendor = (p) => fileURLToPath(new URL(`./vendor/three/${p}`, import.meta.url));

// Runtime-loaded files (the player ship .glb) are fetched by URL, so copy them into dist/.
const copyRuntimeAssets = () => ({
  name: 'copy-runtime-assets',
  closeBundle() {
    const src = fileURLToPath(new URL('./assets', import.meta.url));
    const dest = fileURLToPath(new URL('./dist/assets', import.meta.url));
    if (existsSync(src)) cpSync(src, dest, { recursive: true });
  },
});

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      { find: /^three$/, replacement: vendor('build/three.module.js') },
      { find: /^three\/addons\/(.*)$/, replacement: vendor('examples/jsm/$1') },
    ],
  },
  plugins: [copyRuntimeAssets()],
  build: { chunkSizeWarningLimit: 1500 },
  server: { port: 5173, open: false },
});
