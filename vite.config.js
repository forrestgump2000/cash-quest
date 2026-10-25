import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { dedupe: ['three'] },
  build: { chunkSizeWarningLimit: 1000 },
});
