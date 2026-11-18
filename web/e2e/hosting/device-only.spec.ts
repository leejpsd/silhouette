// The hosting build, under the hosting policy, in a browser whose device model is ready: the two-minute
// path and the on-device check make no request to any other origin. App Check, and with it reCAPTCHA,
// starts only when a request is about to go to the cloud, so the record stays at zero.
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';
import { fakeOnDeviceModel } from '../model-fakes';
import { fakeRecaptcha, serveWithPolicy } from './recaptcha';

const hosting = JSON.parse(readFileSync(new URL('../../hosting/firebase.hosting.json', import.meta.url), 'utf8')) as {
  hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
};
const POLICY = hosting.hosting.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
const ANSWERS = JSON.parse(readFileSync(new URL('../../../shared/fixtures/device-check/answers.json', import.meta.url), 'utf8')) as {
  documents: { needle: string; core: Record<string, unknown>; deductions: Record<string, unknown> }[];
};

/** Every request the page makes to another origin (the network, not the record). */
function crossOrigin(context: BrowserContext, origin: string): string[] {
  const seen: string[] = [];
  context.on('request', (r) => {
    const url = new URL(r.url());
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== origin) seen.push(`${r.method()} ${url.origin}${url.pathname}`);
  });
  return seen;
}

test.beforeEach(async ({ context, page }) => {
  await fakeOnDeviceModel(context, { availability: 'available', replies: {}, documentReplies: ANSWERS.documents, defaultReply: 'A short answer about the program.' });
  // Answered if they were ever asked; the test fails if they are.
  await fakeRecaptcha(context, page);
});

test('the two-minute path with a ready device model leaves nothing at all', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  const violations = await serveWithPolicy(page, POLICY, origin);
  const requests = crossOrigin(context, origin);
  await page.goto('/#/judges');
  await expect(page.getByTestId('judges-device')).toHaveAttribute('data-device', 'available');
  // 1. The prepared household.
  await page.getByRole('button', { name: 'Fill in and see the results' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
  // 2. The sample: read ahead on the device while the preview is open, then Send.
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Open the sample paystub' }).click();
  // The read-ahead asks the device before Send.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fakePrompts: string[] }).__fakePrompts.length), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
  await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
  await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
  // 3. What left: nothing.
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Open “Leaving your device”' }).click();
  await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
  await expect(page.getByTestId('leaving-bar')).toContainText('Nothing has left this device.');
  expect(requests).toEqual([]);
  expect(violations).toEqual([]);
});

test('the on-device check with a ready device model leaves nothing at all', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  await serveWithPolicy(page, POLICY, origin);
  const requests = crossOrigin(context, origin);
  await page.goto('/#/device-check');
  await page.getByTestId('run-device-check').click();
  await expect(page.getByTestId('device-check-status')).toHaveText('Finished.', { timeout: 60_000 });
  const rows = page.locator('.device-table tbody tr');
  await expect(rows).toHaveCount(14);
  await expect(page.locator('.device-table tbody tr[data-ran="IN_CLOUD"]')).toHaveCount(0);
  await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
  expect(requests).toEqual([]);
});
