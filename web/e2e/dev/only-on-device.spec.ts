// In a real page, the app's ONLY_ON_DEVICE functions, called directly (not through the UI), send
// nothing anywhere when the browser has no ready on-device model, and fail with a typed error.
import { expect, test } from '@playwright/test';

for (const availability of ['absent', 'unavailable', 'downloadable', 'downloading'] as const) {
  test(`LanguageModel ${availability}: zero network requests and a typed error`, async ({ page }) => {
    await page.goto('/e2e/dev/only-on-device.html');
    await page.waitForFunction(() => document.body.dataset['ready'] === 'true');
    const requests: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).origin !== new URL(page.url()).origin) requests.push(r.url());
    });
    const outcomes = await page.evaluate((a) => (window as unknown as { runGuard: (a: string) => Promise<string[]> }).runGuard(a), availability);
    expect(outcomes).toEqual(['on-device-unavailable', 'on-device-unavailable', 'on-device-unavailable']);
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
  });
}
