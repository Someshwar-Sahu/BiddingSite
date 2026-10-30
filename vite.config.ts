import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        admin: resolve(import.meta.dirname, 'client/admin.html'),
        customer: resolve(import.meta.dirname, 'client/customer.html'),
      },
    },
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
