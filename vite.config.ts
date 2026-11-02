import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], css: true, include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'] },
});
