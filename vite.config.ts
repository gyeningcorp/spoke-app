import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/spoke-app/',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  server: {
    host: true,
    port: 5173,
  },
});
