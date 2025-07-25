import { defineConfig } from 'vite';

export default defineConfig({
  base: '/platonic-play/',
  resolve: {
    alias: {
      'colormap-selector': new URL('./node_modules/colormap-selector/dist/index.js', import.meta.url).pathname
    }
  },
  optimizeDeps: {
    include: ['colormap-selector']
  }
});