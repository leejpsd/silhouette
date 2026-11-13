// Screen captures of every screen and state for design review: npm run capture.
// Output: visual-captures/ (git-ignored). Uses the app's own fakes; no request leaves the machine.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: './e2e/visual',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 120_000,
  use: { baseURL: `http://localhost:${PORT}`, ...devices['Desktop Chrome'] },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
