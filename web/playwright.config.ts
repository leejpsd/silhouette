import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** The build people get (California pack), for the end-to-end checks of the shipped pack (e2e/california). */
const CA_PORT = 4176;
/** The hosting build (mode hosting) with a test site key, for reCAPTCHA Enterprise and App Check (e2e/hosting). */
const HOSTING_PORT = 4177;
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
    { name: 'chromium', testIgnore: ['visual/**', 'dev/**', 'california/**', 'hosting/**'], use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', testIgnore: ['visual/**', 'dev/**', 'california/**', 'hosting/**'], use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: false } },
    // The build people get, with the California pack.
    { name: 'california', testMatch: ['california/**/*.spec.ts'], use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${CA_PORT}` } },
    // The hosting build with reCAPTCHA Enterprise App Check; its own service worker is kept out so every page gets the test policy.
    { name: 'hosting', testMatch: ['hosting/**/*.spec.ts'], use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${HOSTING_PORT}`, serviceWorkers: 'block' } },
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
      // A test site key from the environment takes precedence over web/.env.hosting.local: the real key is never used here.
      command: `VITE_RECAPTCHA_SITE_KEY=e2e-site-key npx vite build --mode hosting --outDir dist-hosting && npx vite preview --mode hosting --outDir dist-hosting --port ${HOSTING_PORT} --strictPort`,
      url: `http://localhost:${HOSTING_PORT}`,
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
