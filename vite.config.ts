import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [preact()],
    server: {
        hmr: false,
        port: 3000,
    },
});
