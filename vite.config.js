import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/', // This is correct for custom domain
  resolve: {
    alias: {
      'colormap-selector': resolve(process.cwd(), 'node_modules/colormap-selector')
    }
  }
});