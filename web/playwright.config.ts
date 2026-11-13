import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  // Screen captures for design review run on their own (npm run capture).
  testIgnore: ['visual/**'],
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: false } },
  ],
  webServer: {
    // Tests run against the production build so the service worker is real.
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
