import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:3102', channel: 'msedge', headless: true },
  webServer: { command: 'npm run start -- --hostname 127.0.0.1 --port 3102', url: 'http://127.0.0.1:3102', reuseExistingServer: false },
});
