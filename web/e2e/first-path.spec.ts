// What a person meets first on the main path: the judges' way in on a phone, lines that say where a
// paystub is read (on this device only when a model here reads it), and the preview's keep / send row
// in view on a laptop screen.
import { expect, test, type Page } from '@playwright/test';
import { chooseLanguage, completeQuickCheck } from './helpers';
import { fakeOnDeviceModel, noOnDeviceModel } from './model-fakes';

const DEVICE_SHARPEN = 'Read on this device. Only its silhouette can leave.';
const CLOUD_SHARPEN = 'Read as a silhouette in the cloud. Your values stay on this device.';
const CLOUD_SOURCE = 'Only its silhouette is read, in the cloud';

test.describe('the judges’ way in', () => {
  test('on a phone the start screen links to the judges’ page, above the dock', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'a narrow layout');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const link = page.getByTestId('start-judges');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('For judges: try it in two minutes');
    await expect(link).toHaveAttribute('href', '#/judges');
    // Seen without scrolling, and not under the dock.
    const own = (await link.boundingBox())!;
    const dock = (await page.getByTestId('bottom-block').boundingBox())!;
    expect(own.y).toBeGreaterThanOrEqual(0);
    expect(own.y + own.height).toBeLessThanOrEqual(dock.y);
    // It is a quiet link, not a second main action: the dock still holds the one action.
    await expect(page.getByTestId('bottom-block').getByRole('link', { name: /judges/i })).toHaveCount(0);
    await link.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Try it in two minutes');
  });

  test('in the wide layout the rail has the link, and the hero has it beside the start actions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'a wide layout');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('start-judges')).toHaveCount(0);
    await expect(page.locator('.rail-links').getByRole('link', { name: 'For judges' })).toBeVisible();
    // A quiet link beside the start actions, in the first screen.
    const hero = page.getByTestId('start-judges-hero');
    await expect(hero).toHaveText('For judges: try it in two minutes');
    await expect(hero).toHaveAttribute('href', '#/judges');
    await expect(hero).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('screen-actions').getByTestId('start-judges-hero')).toBeVisible();
    await hero.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Try it in two minutes');
  });
});

test.describe('where a paystub is read, said truly', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'copy, the same at every width');
  });

  async function results(page: Page) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await completeQuickCheck(page);
  }

  test('without an on-device model, no line says the paystub is read on this device', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await results(page);
    const help = page.getByTestId('sharpen-help');
    await expect(help).toHaveText(CLOUD_SHARPEN);
    await expect(help).toHaveAttribute('data-on-device', 'false');

    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'unavailable');
    await expect(page.getByTestId('paste-where')).toHaveText(CLOUD_SOURCE);
    await expect(page.getByTestId('pdf-where')).toHaveText(CLOUD_SOURCE);
    // Photos are only ever read on the device: that line stays as it is.
    await expect(page.getByTestId('photo-option')).toContainText('Not available on this device yet');
    await expect(page.locator('.source-list')).not.toContainText('Read on this device');
    await expect(page.locator('.source-list')).not.toContainText('Read here');
  });

  test('with a ready on-device model, the lines say it is read on this device', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: {} });
    await results(page);
    await expect(page.getByTestId('sharpen-help')).toHaveText(DEVICE_SHARPEN);

    await page.goto('/#/doc');
    await expect(page.getByTestId('paste-where')).toHaveText('Read on this device');
    await expect(page.getByTestId('pdf-where')).toHaveText('Read here, never uploaded');
  });

  test('a model that can only be downloaded does not count as reading on this device', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'downloadable', replies: {} });
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'downloadable');
    await expect(page.getByTestId('paste-where')).toHaveText(CLOUD_SOURCE);
  });

  test('in Spanish, without a model, the lines say the cloud in Spanish', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/doc');
    await chooseLanguage(page, 'es');
    await expect(page.getByTestId('paste-where')).toHaveText('Solo su silueta se lee, en la nube');
  });
});

test.describe('the preview’s keep / send row', () => {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
  ] as const) {
    for (const model of ['none', 'ready'] as const) {
      test(`is in view without scrolling at ${width} x ${height} (${model === 'none' ? 'no model' : 'a ready model'})`, async ({ page, context }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'a wide layout');
        if (model === 'none') await noOnDeviceModel(context);
        else await fakeOnDeviceModel(context, { availability: 'available', replies: {} });
        await page.setViewportSize({ width, height });
        await page.goto('/#/doc');
        await page.getByRole('button', { name: 'English paystub (text)' }).click();
        await expect(page.getByTestId('skeleton-preview')).toBeVisible();
        const main = page.getByRole('button', { name: model === 'none' ? 'Send' : 'Read on this device', exact: true });
        const keep = page.getByRole('button', { name: 'Keep everything on this device' });
        for (const button of [main, keep]) {
          await expect(button).toBeVisible();
          const b = (await button.boundingBox())!;
          expect(b.y, 'its top edge is on screen').toBeGreaterThanOrEqual(0);
          expect(b.y + b.height, 'its bottom edge is on screen').toBeLessThanOrEqual(height);
        }
        // Nothing has scrolled to get there.
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      });
    }
  }
});
