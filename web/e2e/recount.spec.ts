import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.describe('the cloud evaluation, recounted from its own file', () => {
  test('"Recount from the file" recounts 30 of 30 and 0 of 39 in the browser, and the file downloads', async ({ page }) => {
    await page.goto('/#/tasks');
    const recount = page.getByTestId('recount');
    await expect(recount).toBeVisible();
    await recount.getByTestId('recount-button').click();
    const result = recount.getByTestId('recount-result');
    await expect(result).toHaveAttribute('data-same', 'true');
    await expect(result.getByTestId('recount-right')).toHaveText('30 of 30 paystubs read entirely right');
    await expect(result.getByTestId('recount-leaks')).toContainText(/^0 of 39 cloud requests contained any of the [\d,]+ names, dates and amounts/);
    await expect(result).toContainText('Same as the totals above.');

    const [download] = await Promise.all([page.waitForEvent('download'), recount.getByTestId('recount-download').click()]);
    expect(download.suggestedFilename()).toBe('cloud-evaluation-v15p4.json');
    const saved = JSON.parse(readFileSync((await download.path())!, 'utf8')) as { documents: unknown[] };
    expect(saved.documents.length).toBeGreaterThan(30);
  });

  test.describe(() => {
    // Without the service worker, so the request reaches the route below.
    test.use({ serviceWorkers: 'block' });
  test('a file that does not load says so, and recounts nothing', async ({ page }) => {
    await page.route(/v15p4.*\.json/, (route) => route.abort());
    await page.goto('/#/tasks');
    await page.getByTestId('recount-button').click();
    await expect(page.getByTestId('recount-failed')).toHaveText('The evaluation file did not load, so nothing was recounted. Check the connection and try again.');
    await expect(page.getByTestId('recount-result')).toHaveCount(0);
  });
  });
});
