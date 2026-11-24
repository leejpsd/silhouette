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

test.describe('the device figures beside the never-seen results', () => {
  test('#/tasks labels the runs on the check paystubs and shows each device on never-seen paystubs, the iPhone counted from its run file', async ({ page }) => {
    await page.goto('/#/tasks');
    const iphone = page.getByTestId('heldout-iphone');
    // As node eval/heldout-score.mjs counts the run file: 22 wrong first answers, all stopped; 2 on the iPhone; 19 all right; 1 wrong, from the cloud.
    await expect(iphone).toHaveAttribute('data-first', '22', { timeout: 15_000 });
    await expect(iphone).toHaveAttribute('data-stopped', '22');
    await expect(iphone).toHaveAttribute('data-on-device', '2');
    await expect(iphone).toHaveAttribute('data-all-right', '19');
    await expect(iphone).toHaveAttribute('data-wrong', '1');
    await expect(iphone.getByTestId('heldout-iphone-wrong')).toContainText('1 / 24');
    await expect(iphone.getByTestId('heldout-iphone-caught')).toContainText('1 of 1 wrong values came from the cloud');
    const devices = page.getByTestId('measured-device');
    await expect(devices).toHaveCount(2);
    for (const device of await devices.all()) {
      await expect(device.getByTestId('measured-tuned')).toHaveText('On the 5 check paystubs the checks were changed against');
      await expect(device.getByTestId('measured-never-seen')).toContainText('On 24 never-seen paystubs');
    }
    await expect(devices.filter({ hasText: 'iPhone 17 Pro' }).getByTestId('measured-never-seen')).toContainText('22 of 24 first answers had a wrong yearly-income input; the checks stopped 22 of 22');
    await expect(devices.filter({ hasText: 'Chrome 157' }).getByTestId('measured-never-seen')).toContainText('a wrong yearly-income value reached the person: 0 of 24');
  });

  test("the judges' page labels its recorded runs and shows both devices on never-seen paystubs", async ({ page }) => {
    await page.goto('/#/judges');
    const runs = page.getByTestId('recorded-runs');
    await expect(runs.getByTestId('recorded-tuned')).toHaveText('Measured on the 5 check paystubs the checks were changed against.');
    const chrome = runs.getByTestId('judges-heldout-chrome');
    await expect(chrome).toContainText('Chrome 157 · Mac · first never-seen set');
    await expect(chrome).toContainText('12 of 24 first answers had a wrong yearly-income input; the checks stopped 12 of 12');
    await expect(chrome).toContainText('11 read again in the cloud');
    await expect(chrome).toContainText('a wrong yearly-income value reached the person: 0 of 24');
    const iphone = runs.getByTestId('judges-heldout-iphone');
    await expect(iphone).toContainText('iPhone 17 Pro · third never-seen set');
    await expect(iphone).toContainText('22 of 24 first answers had a wrong yearly-income input; the checks stopped 22 of 22');
    await expect(iphone).toContainText('2 answered on-device, nothing sent');
    await expect(iphone).toContainText('every yearly-income input right on 19');
    await expect(iphone).toContainText("a wrong yearly-income value reached the person: 1 of 24, from the cloud's answer");
  });
});
