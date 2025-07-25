import { defineConfig } from 'vite';

export default defineConfig({
  base: '/platonic-play/',
  resolve: {
    alias: {
      'colormap-selector': new URL('./node_modules/colormap-selector', import.meta.url).pathname
    }
  }
});