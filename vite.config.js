import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5174,
    strictPort: true,
    open: true
  },
  build: {
    outDir: 'dist'
  }
});
