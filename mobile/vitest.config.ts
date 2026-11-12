import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: {alias: {'react':fileURLToPath(new URL('../node_modules/react', import.meta.url)), 'react-native':fileURLToPath(new URL('./tests/native.tsx', import.meta.url))}},
  test: {environment:'jsdom', include:['tests/**/*.test.{ts,tsx}'], restoreMocks:true},
});
