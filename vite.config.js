import { defineConfig } from 'vite';

export default defineConfig({
  base: '/platonic-play/',
  build: {
    rollupOptions: {
      external: [],
      output: {
        manualChunks: undefined
      }
    },
    commonjsOptions: {
      include: [/colormap-selector/, /node_modules/]
    }
  },
  optimizeDeps: {
    include: ['colormap-selector']
  }
});