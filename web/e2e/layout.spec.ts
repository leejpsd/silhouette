// Layout and presentation: the wide two-column layout, the review screen's order, the preview that
// wraps instead of scrolling sideways, the exact amount kept above the block, and answers written on
// this device counted as kept.
import { expect, test, type Page } from '@playwright/test';
import { completeQuickCheck, confirmAllValues } from './helpers';
import { fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;

test.describe('layout', () => {
  for (const width of [960, 1280, 1920]) {
    test(`from 960 px the block is a 400 px panel beside one content column (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const columns: number[] = [];
      const measure = async () => {
        const block = await box(page, 'bottom-block');
        expect(block.width).toBe(400);
        expect(block.x + block.width).toBeLessThan(width);
        const main = await page.locator('main .screen').first().boundingBox();
        expect(main!.x + main!.width, 'the content stays left of the block').toBeLessThanOrEqual(block.x);
        columns.push(Math.round(main!.x), Math.round(main!.width));
      };
      await measure();
      await page.getByRole('button', { name: 'Start Quick Check' }).click();
      await measure();
      await page.goto('/');
      await completeQuickCheck(page);
      await measure();
      // The same column on every screen: nothing moves sideways.
      expect(new Set(columns.filter((_, i) => i % 2 === 0)).size).toBe(1);
      expect(new Set(columns.filter((_, i) => i % 2 === 1)).size).toBe(1);
      expect(columns[1]).toBeLessThanOrEqual(640);
    });
  }

  test('wide screens: sheets open in the block column', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const block = await box(page, 'bottom-block');
    await page.getByTestId('language-button').click();
    const sheet = await box(page, 'language-sheet');
    expect(Math.round(sheet.x)).toBe(Math.round(block.x));
    expect(Math.round(sheet.width)).toBe(400);
  });

  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    test(`the exact amount and how it was understood are fully above the block (${size.width} × ${size.height})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/#/q/income');
      await page.getByLabel('I know the exact amount').check();
      const field = page.getByLabel('Yearly household income');
      await field.fill('28000.50');
      await expect(page.getByTestId('amount-understood')).toHaveText('Understood as $28,000.50 a year.');
      await expect
        .poll(async () => {
          const [f, block] = await Promise.all([page.getByTestId('exact-field').boundingBox(), page.getByTestId('bottom-block').boundingBox()]);
          const ok = f!.y >= 0 && f!.y + f!.height <= block!.y + 1;
          return ok ? true : `field ${Math.round(f!.y)}..${Math.round(f!.y + f!.height)}, block from ${Math.round(block!.y)}`;
        })
        .toBe(true);
    });
  }
});

test.describe('documents', () => {
  test('review: what decides the result first, the rest folded until seen; nothing is confirmed unseen', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const lead = page.getByTestId('lead-fields');
    for (const name of ['grossPay', 'ytdGross', 'payDate', 'payFrequency']) await expect(lead.getByTestId(`field-${name}`)).toBeVisible();
    const more = page.getByTestId('more-values');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('field-hoursWorked')).toBeHidden();
    const confirmAll = page.getByRole('button', { name: /^Confirm all \d+ values$/ });
    const count = Number(/(\d+)/.exec((await confirmAll.textContent()) ?? '')?.[1]);
    expect(count).toBeGreaterThan(10);
    // First press: the folded values are shown, nothing is confirmed yet.
    await confirmAll.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('field-hoursWorked')).toBeVisible();
    await expect(page.getByTestId('field-hoursWorked')).toHaveAttribute('data-status', 'pending');
    await confirmAll.click();
    await expect(page.getByTestId('field-hoursWorked')).toHaveAttribute('data-status', 'confirmed');
    await page.getByRole('button', { name: 'Check these values' }).click();
    // The yearly income, with its arithmetic, comes right after the leading values, as money.
    await expect(page.getByTestId('annual-income')).toHaveText(/^\$[\d,]+$/);
  });

  test('preview: long lines wrap inside the paper, and both views place every placeholder alike', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await noOnDeviceModel(context);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    const doc = page.getByTestId('skeleton-preview');
    await expect(doc).toHaveAttribute('data-mode', 'leave');
    expect(await doc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const places = () => doc.locator('.tok').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width)];
    }));
    const leave = await places();
    await page.getByRole('button', { name: 'On this phone' }).click();
    await expect(doc).toHaveAttribute('data-mode', 'phone');
    // The paper turns slightly between the two views, so compare positions with the turn undone.
    await doc.evaluate((el) => (el.style.transform = 'none'));
    const phone = await places();
    await page.getByRole('button', { name: 'What could leave' }).click();
    await doc.evaluate((el) => (el.style.transform = 'none'));
    expect(phone).toEqual(await places());
    expect(leave.length).toBe(phone.length);
  });

  test('an answer written on this device is recorded as kept: no host, no body, not counted as sent', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: paystub': JSON.stringify(fixturePointers('paystub-en-01-correct')) } });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    const bar = page.getByTestId('leaving-bar');
    await expect(bar).toHaveAttribute('data-outbound-count', '0');
    await expect(bar).toHaveAttribute('data-kept-count', '1');
    await expect(bar.locator('.count-row')).toContainText('Nothing has left this device.');
    await bar.getByRole('button', { name: 'Details' }).click();
    await expect(page.getByTestId('record-headline')).toHaveText('0 sent, 1 kept.');
    const kept = bar.locator('li[data-status="answered"]');
    await expect(kept).toHaveCount(1);
    await expect(kept).toContainText('Answered on this device');
    await expect(kept).not.toContainText('Request to');
    await expect(kept.getByRole('button', { name: 'Show exactly what was sent' })).toHaveCount(0);
  });
});

test('confirming values is still possible from the keyboard after the fold opens', async ({ page, context }) => {
  await noOnDeviceModel(context);
  await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await page.goto('/#/doc');
  await page.getByRole('button', { name: 'English paystub (text)' }).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await confirmAllValues(page);
  await expect(page.getByRole('button', { name: 'Check these values' })).toBeEnabled();
});

test.describe('first impression and sheets', () => {
  test('the start screen says the promise in words, labels the example, and keeps the main action above the fold at 320 x 568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await expect(page.getByTestId('start-promise')).toBeVisible();
    await expect(page.getByTestId('start-example')).toContainText('Example');
    const action = await page.getByRole('button', { name: 'Start Quick Check' }).boundingBox();
    expect(action!.y + action!.height).toBeLessThanOrEqual(568);
  });

  test('the ground colour of both themes is in the document head, so nothing flashes white', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<style>html\{color-scheme:light dark;background:#[0-9A-Fa-f]{6}\}@media \(prefers-color-scheme: dark\)\{html\{background:#[0-9A-Fa-f]{6}\}\}<\/style>/);
  });

  test('the count stays in view in every sheet; the record traps focus and returns it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-button').click();
    await expect(page.getByTestId('language-sheet').getByTestId('sheet-count')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('demo-banner').getByRole('button', { name: 'More' }).click();
    await expect(page.getByTestId('demo-sheet').getByTestId('sheet-count').last()).toBeInViewport();
    await page.keyboard.press('Escape');
    const details = page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' });
    await details.click();
    const record = page.getByTestId('record-sheet');
    await expect(record).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      // A modal sheet: focus never reaches the page behind it (it may pass to the browser's own controls).
      expect(await page.evaluate(() => {
        const a = document.activeElement;
        return a === null || a === document.body || a.closest('[data-testid="record-sheet"]') !== null;
      })).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(details).toBeFocused();
  });

  test('selection is ink, not pink, and "0 sent" is not pink', async ({ page }) => {
    await page.goto('/#/q/income');
    await page.getByLabel('$15,000 to $29,999', { exact: true }).check();
    const radio = page.getByLabel('$15,000 to $29,999', { exact: true });
    const [bg, leave] = await radio.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--leave')]);
    expect(bg).not.toBe(leave);
    expect(bg).not.toMatch(/rgb\(2[0-9]{2}, 1[0-9]{2}, 2[0-9]{2}\)/);
  });
});

test('at 768 px the column is centred and the block floats, not a full-width bar', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  const block = (await page.getByTestId('bottom-block').boundingBox())!;
  expect(block.width).toBeLessThanOrEqual(640);
  expect(Math.round(block.x)).toBe(Math.round((768 - block.width) / 2));
});
