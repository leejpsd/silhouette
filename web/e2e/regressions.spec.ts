// Regression tests for problems found by testing the app in a real browser.
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_ANSWERS, answerCurrent, completeQuickCheck, verdictOf } from './helpers';
import { AI_HOST, fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

async function sendSample(page: Page) {
  await page.goto('/#/doc');
  await page.getByRole('button', { name: 'English paystub (text)' }).click();
  await page.getByTestId('skeleton-preview').waitFor();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByTestId('inference-badge').waitFor();
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('regressions', () => {
  test('an exact income with decimals is read as typed, and the understood amount is shown', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Quick Check' }).click();
    for (let i = 0; i < 3; i++) await answerCurrent(page, DEFAULT_ANSWERS);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/earn in a year/);
    await page.getByLabel('I know the exact amount').check();
    const field = page.getByLabel('Yearly household income');
    await field.fill('28.000,50');
    await expect(page.getByTestId('amount-understood')).toHaveText('');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('alert')).toContainText('32,000.50');
    await field.fill('28000.50');
    await expect(page.getByTestId('amount-understood')).toHaveText('Understood as 28,000.50 a year.');
    await field.fill('$28,000.5');
    await expect(page.getByTestId('amount-understood')).toHaveText('Understood as 28,000.50 a year.');
    await page.getByRole('button', { name: 'Next' }).click();
    for (let i = 0; i < 4; i++) await answerCurrent(page, DEFAULT_ANSWERS);
    // work-credit amount = min(3000, 0.1 × 28,000.50) = 2,800.05 → 2,800 (not 280,005 or 2,800,050)
    await expect(verdictOf(page, 'work-credit')).toContainText('About 2,800 a year');
  });

  test('the ledger survives a reload, shows status and the whole request, and says when it was deleted', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await sendSample(page);
    await page.reload();
    const bar = page.getByTestId('leaving-bar');
    await expect(bar).toHaveAttribute('data-outbound-count', '1');
    await bar.getByRole('button', { name: 'Details' }).click();
    await expect(bar).not.toContainText('No answers, results or documents have been sent anywhere');
    await expect(bar).toContainText('Only the requests listed below have left it');
    await expect(bar.getByTestId('outbound-status')).toHaveText('Sent, response 200');
    await expect(bar).toContainText(`Request to ${AI_HOST}/v1beta/projects/silhouette-hybrid/models/gemini-3.5-flash-lite:generateContent`);
    await expect(bar).toContainText('Model: gemini-3.5-flash-lite');
    await bar.getByText('Show exactly what was sent').click();
    const body = (await bar.getByTestId('outbound-payload').textContent()) ?? '';
    for (const part of ['"systemInstruction"', '"generationConfig"', '"responseSchema"', '"required"', 'Document type: paystub']) expect(body).toContain(part);
    expect(body).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/); // API key
    expect(body).not.toMatch(/token/i);

    await page.getByRole('button', { name: 'Delete everything' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
    await expect(bar).toHaveAttribute('data-outbound-count', '0');
    await expect(bar).toHaveAttribute('data-cleared', 'true');
    await expect(bar).toContainText('Record deleted on');
    await expect(bar).not.toContainText('Nothing has left this device.');
    await page.reload();
    await expect(page.getByTestId('leaving-bar')).toContainText('Record deleted on');
  });

  test('"Delete everything" also removes the Firebase SDK databases', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await sendSample(page);
    const before = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
    expect(before.some((n) => n?.startsWith('firebase'))).toBe(true);
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText(/Erased: answers, documents in progress/)).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('firebase')))).toEqual([]);
  });

  test('an on-device failure is retried once in the cloud with the silhouette, and the chip says so', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: {}, throwMessage: 'The input is too large.' });
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await sendSample(page);
    expect(cloud.bodies).toHaveLength(1);
    expect(cloud.bodies[0]).not.toContain('1,271.88');
    const badge = page.getByTestId('inference-badge');
    await expect(badge).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(badge).toHaveAttribute('data-reason', 'on-device-failed');
    await expect(badge).toContainText('on-device attempt failed');
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
  });

  test('a visible word can be hidden before sending (keyboard), with undo; the hidden word is not sent', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: {} });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    const preview = page.getByTestId('skeleton-preview');
    await expect(preview).toContainText('Net Pay');
    const hideNet = page.getByRole('button', { name: 'Hide “Net”' });
    await hideNet.focus();
    await page.keyboard.press('Enter');
    await expect(preview).not.toContainText('Net Pay');
    const undo = page.getByRole('button', { name: 'Show “net” again' });
    await expect(undo).toBeVisible();
    await undo.focus();
    await page.keyboard.press('Enter');
    await expect(preview).toContainText('Net Pay');
    await page.getByRole('button', { name: 'Hide “Net”' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByTestId('inference-badge').waitFor();
    expect(cloud.bodies[0]).not.toContain('Net Pay');
  });

  test('a label in front of a masked name stays visible, and hiding it masks the label too', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: {} });
    await page.goto('/#/doc');
    await page.getByLabel('Paystub text').fill('Employee Lucia Lindqvist   ID 004417\nGross Pay 1,200.00\nNet Pay 950.00');
    await page.getByRole('button', { name: 'Continue with this text' }).click();
    const preview = page.getByTestId('skeleton-preview');
    await expect(preview).toContainText('Employee W1 W2');
    await expect(preview).not.toContainText('Lucia');
    await page.getByRole('button', { name: 'Hide “Employee”' }).click();
    await expect(preview).toContainText('W1 W2 W3');
    await expect(preview).not.toContainText('Employee');
    await expect(preview).toContainText('Gross Pay');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByTestId('inference-badge').waitFor();
    expect(cloud.bodies[0]).not.toContain('Employee');
    expect(cloud.bodies[0]).not.toContain('Lindqvist');
  });

  test('a document that is not a paystub gets a plain message and a way forward', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: {} });
    await sendSample(page).catch(() => undefined);
    await expect(page.getByTestId('not-a-document')).toBeVisible();
    await expect(page.getByText('Not found')).toHaveCount(0);
    await page.getByRole('button', { name: 'Type the numbers yourself' }).click();
    await expect(page.getByTestId('value-grossPay')).toHaveText('Not found');
  });

  test('narrow phones: the document screens never scroll sideways', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    for (const width of [320, 360, 375]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/#/doc');
      await page.getByTestId('model-status').waitFor();
      expect(await noOverflow(page), `add ${width}`).toBe(true);
      await page.getByRole('button', { name: 'English paystub (text)' }).click();
      await page.getByTestId('skeleton-preview').waitFor();
      expect(await noOverflow(page), `preview ${width}`).toBe(true);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByTestId('inference-badge').waitFor();
      expect(await noOverflow(page), `review ${width}`).toBe(true);
    }
  });

  test('the last control on a page is not hidden under the sticky bar when focused', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/');
    await completeQuickCheck(page);
    const last = page.getByRole('link', { name: 'Add a paystub' });
    await last.focus();
    const [box, bar] = await Promise.all([last.boundingBox(), page.getByTestId('leaving-bar').boundingBox()]);
    expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);
  });

  test('the demo banner is compact after the start screen, and the start button says what it does', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('demo-banner')).toHaveAttribute('data-compact', 'false');
    await page.getByRole('button', { name: 'Start Quick Check' }).click();
    await expect(page.getByTestId('demo-banner')).toHaveAttribute('data-compact', 'true');
    const banner = await page.getByTestId('demo-banner').boundingBox();
    expect(banner!.height).toBeLessThan(60);
    await answerCurrent(page, DEFAULT_ANSWERS);
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Continue Quick Check' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/How many children/);
    await page.goto('/#/');
    await page.goto('/');
    await page.getByRole('button', { name: 'Start over' }).click();
    for (let i = 0; i < 8; i++) await answerCurrent(page, DEFAULT_ANSWERS);
    await page.goto('/#/');
    await page.getByRole('button', { name: 'See my results' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
  });
});
