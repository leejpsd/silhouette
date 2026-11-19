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

test.describe('the never-seen sets', () => {
  test('the tasks page shows them, and "Recount the never-seen sets" gets the same figures from the files', async ({ page }) => {
    await page.goto('/#/tasks');
    const block = page.getByTestId('measured-heldout');
    await expect(block).toContainText('On documents it had never seen');
    await expect(block.getByTestId('heldout-paystub-cloud')).toContainText('0 / 24');
    await expect(block.getByTestId('heldout-paystub-device')).toContainText('0 / 24');
    await expect(block.getByTestId('heldout-caught')).toContainText('12 of 24');
    await expect(block.getByTestId('heldout-w2')).toContainText('box 1 right on 10 of 18');
    await block.getByTestId('heldout-recount-button').click();
    const result = block.getByTestId('heldout-recount-result');
    await expect(result).toHaveAttribute('data-same', 'true', { timeout: 30_000 });
    await expect(result.getByTestId('heldout-recount-paystubs')).toHaveText('paystubs with a wrong yearly-income value shown: 0 in the cloud, 0 on the device, of 24');
    await expect(result.getByTestId('heldout-recount-leaks')).toHaveText('0 of 42 cloud requests contained a name, date or amount of their document');
  });
});
