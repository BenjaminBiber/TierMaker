import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Must match PORT in server/.env.dev
const api = process.env.API_URL || 'http://localhost:3017';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': api,
      '/uploads': api,
    },
  },
});
