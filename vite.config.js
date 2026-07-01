import { defineConfig } from 'vite';

export default defineConfig({
  base: '/PoP2048Agent/',
  build: {
    outDir: 'docs',
    emptyOutDir: true
  }
});

