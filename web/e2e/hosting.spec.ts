// The content security policy proposed for Firebase Hosting (hosting/firebase.hosting.json) lets the
// whole app work: start, Quick Check, the sample's silhouette sent to the cloud, the record, and the
// on-device check page. Any violation fails the test.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { completeQuickCheck } from './helpers';
import { fakeCloudModel, fixturePointers, noOnDeviceModel } from './model-fakes';

const hosting = JSON.parse(readFileSync(new URL('../hosting/firebase.hosting.json', import.meta.url), 'utf8')) as {
  hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
};
const CSP = hosting.hosting.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value;

test('the hosting content security policy allows everything the app does, and nothing reports a violation', async ({ page, context }) => {
  await noOnDeviceModel(context);
  await context.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.route((url) => url.origin === 'http://localhost:4173', async (route) => {
    const response = await route.fetch();
    const isDocument = route.request().resourceType() === 'document';
    await route.fulfill({ response, headers: isDocument ? { ...response.headers(), 'content-security-policy': CSP.replace('upgrade-insecure-requests', '') } : response.headers() });
  });
  await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await page.goto('/');
  await completeQuickCheck(page);
  await page.goto('/#/doc');
  await page.getByTestId('more-samples').locator('summary').click();
  await page.getByRole('button', { name: 'English paystub (PDF)' }).click();
  await page.getByTestId('skeleton-preview').waitFor();
  await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
  await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('record-sheet')).toBeVisible();
  await page.goto('/#/device-check');
  await expect(page.getByTestId('device-check')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  // The policy is really in force: a font host is refused.
  await page.evaluate(() => fetch('https://fonts.googleapis.com/css2?family=Inter').catch(() => undefined));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp.join(' '))).toContain('connect-src');
});
