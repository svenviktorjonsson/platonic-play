import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/platonic-play/',
  resolve: {
    alias: {
      'colormap-selector': resolve(process.cwd(), 'node_modules/colormap-selector')
    }
  }
}); 