import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.STORYSTUDIO_EXPORT_TEST_PORT ?? 4281);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/export', timeout: 180_000, expect: { timeout: 20_000 }, workers: 1, retries: 0,
  use: { baseURL, ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: { command: `STORYSTUDIO_PORT=${port} npm run studio`, url: baseURL, reuseExistingServer: false, timeout: 120_000 },
});
