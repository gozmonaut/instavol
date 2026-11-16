import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['tests/setup.ts'],
    // The Neon Auth SDK imports 'next/headers' without a file extension, which only Vite can resolve.
    server: { deps: { inline: ['@neon/auth'] } },
  },
});
