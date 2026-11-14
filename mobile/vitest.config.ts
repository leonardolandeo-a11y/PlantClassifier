import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: {alias: {'react-native-safe-area-context':fileURLToPath(new URL('./tests/expo.tsx', import.meta.url)), 'expo-status-bar':fileURLToPath(new URL('./tests/expo.tsx', import.meta.url)), 'react':fileURLToPath(new URL('../node_modules/react', import.meta.url)), 'react-native':fileURLToPath(new URL('./tests/native.tsx', import.meta.url))}},
  test: {environment:'jsdom', include:['tests/**/*.test.{ts,tsx}'], restoreMocks:true},
});
