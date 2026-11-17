// A returning visitor gets the first page of the latest deploy, with its headers, even with the
// service worker in control; offline, the precached page (covered in quickcheck.spec.ts).
import { expect, test } from '@playwright/test';

test('a changed first page is picked up on the next visit, headers included', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // A new deploy: the server now answers the first page with a marker and a new header.
  await context.route(
    (url) => url.pathname === '/' || url.pathname === '/index.html',
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('<head>', '<head><meta name="e2e-deploy" content="2">');
      await route.fulfill({ response, body, headers: { ...response.headers(), 'x-e2e-deploy': '2' } });
    },
  );
  const next = await page.reload();
  await expect(page.locator('meta[name="e2e-deploy"]')).toHaveAttribute('content', '2');
  expect(next?.headers()['x-e2e-deploy']).toBe('2');
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
});
