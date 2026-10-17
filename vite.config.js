import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'media',
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
