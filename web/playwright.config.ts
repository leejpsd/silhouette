import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** The build people get (California pack), for the end-to-end checks of the shipped pack (e2e/california). */
const CA_PORT = 4176;
/** The dev server, for pages that call the app's modules directly (e2e/dev). */
const DEV_PORT = 4175;

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
    // Every screen and state, against the invented demo pack (build:demo-pack): stable programs and limits.
    { name: 'chromium', testIgnore: ['visual/**', 'dev/**', 'california/**'], use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', testIgnore: ['visual/**', 'dev/**', 'california/**'], use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: false } },
    // The build people get, with the California pack.
    { name: 'california', testMatch: ['california/**/*.spec.ts'], use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${CA_PORT}` } },
    { name: 'modules', testMatch: ['dev/**/*.spec.ts'], use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${DEV_PORT}` } },
  ],
  webServer: [
    {
      // Tests run against a production build so the service worker is real.
      command: `npm run build:demo-pack && npx vite preview --mode demo-pack --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite build --outDir dist-ca && npx vite preview --outDir dist-ca --port ${CA_PORT} --strictPort`,
      url: `http://localhost:${CA_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}/e2e/dev/only-on-device.html`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
