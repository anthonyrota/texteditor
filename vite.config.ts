import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    hmr: false,
    port: 3000,
  },
  build: {
    minify: 'terser',
    terserOptions: {
      mangle: {
        properties: {
          regex: /^\$[mp]_.*/,
        },
      },
    },
  },
});
