import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Only the backend address is read by this Node-side config. No private env file is loaded.
const backend = process.env.PLANT_BACKEND_URL || 'http://127.0.0.1:18080';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: Object.fromEntries(['/csrf', '/sensors', '/movement'].map(path => [path, { target: backend }])),
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  test: { environment: 'jsdom', setupFiles: ['tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx,js}'], restoreMocks: true },
});
