import { expect, test } from '@playwright/test';
import { makeTextPdf } from '../scripts/text-pdf.mjs';
import { completeQuickCheck, verdictOf } from './helpers';
import { readFileSync } from 'node:fs';
import { AI_HOST, fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel, placeholderFor, recordRequests, sharedText } from './model-fakes';

test.describe('Document silhouette and pointer extraction', () => {
  test('sample paystub (PDF through pdf.js) → silhouette → cloud pointers → confirm → exact income resolves maybe', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/');
    await completeQuickCheck(page, { numChildren: '1', income: { band: '30,000 to 44,999' } });
    await expect(verdictOf(page, 'work-credit')).toHaveAttribute('data-verdict', 'maybe');

    await page.getByRole('link', { name: 'Add a paystub' }).click();
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'unavailable');
    await expect(page.getByTestId('photo-option')).toContainText("this device can't do that yet");
    await page.getByRole('button', { name: 'English paystub (PDF)' }).click();

    // Preview: the skeleton, before anything is sent.
    const preview = page.getByTestId('skeleton-preview');
    await expect(preview).toContainText('Gross Pay');
    await expect(preview).not.toContainText('1,271.88');
    await expect(preview).not.toContainText('NORTHWIND');
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
    expect(cloud.bodies).toHaveLength(0);
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    // Review: provenance badge and reason chip, value next to its highlighted source.
    await expect(page.getByRole('heading', { level: 1, name: 'Check what was found' })).toBeVisible();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(page.getByTestId('inference-badge')).toContainText('Cloud');
    await expect(page.getByTestId('inference-badge')).toContainText('document silhouette only');
    const gross = page.getByTestId('field-grossPay');
    await expect(gross.getByTestId('value-grossPay')).toHaveText('1,271.88');
    await expect(gross.locator('mark')).toHaveText('1,271.88');
    await expect(page.getByTestId('field-hoursWorked')).toContainText('62.00');

    // What left the device is exactly the silhouette, and the bar says so.
    expect(cloud.bodies).toHaveLength(1);
    expect(cloud.bodies[0]).toContain('Document type: paystub');
    expect(cloud.bodies[0]).not.toContain('1,271.88');
    await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
    await expectOnlyModelAndSettings(page, 1);
    await page.getByText('Show exactly what was sent').click();
    await expect(page.getByTestId('outbound-payload')).toContainText('Gross Pay');
    await expect(page.getByTestId('outbound-payload')).not.toContainText('1,271.88');
    await page.getByTestId('leaving-bar').getByRole('button', { name: 'Hide details' }).click();

    // Confirm one field by itself, then the rest, then check.
    await gross.getByRole('button', { name: 'Confirm: Gross pay this period' }).click();
    await expect(gross).toHaveAttribute('data-status', 'confirmed');
    await page.getByRole('button', { name: 'Confirm all found values' }).click();
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByTestId('validation').locator('[data-check="net-sum"]')).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('validation').locator('[data-check="rate-hours"]')).toHaveAttribute('data-status', 'warn');
    await expect(page.getByTestId('annual-income')).toHaveAttribute('data-amount', '29233');
    await page.getByRole('button', { name: 'Use 29,233 as my yearly income' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
    await expect(verdictOf(page, 'work-credit')).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'work-credit')).toContainText('About 2,923 a year');
  });

  test('canary: no canary string appears in any outgoing request URL, header or body', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const canary = JSON.parse(sharedText('fixtures/canary/paystub-canary-01.json')) as { document: string; canaries: string[] };
    const requests = recordRequests(page);
    const id = (text: string) => placeholderFor('paystub-canary-01', text);
    await fakeCloudModel(page, {
      pointers: {
        employerName: [id('QUILLFEATHER')],
        employeeName: [id('Zyxwanda'), id('Quillfeather')],
        grossPay: id('1,487.50'),
        ytdGross: id('26,775.00'),
        netPay: id('1,416.37'),
        payFrequency: 'semimonthly',
        periodStart: id('09/16/2026'),
        periodEnd: id('09/30/2026'),
        payDate: id('10/05/2026'),
        deductions: [{ amount: id('71.13'), kind: 'federal_tax' }],
      },
    });
    await page.goto('/#/doc');
    await page.getByRole('heading', { level: 2, name: 'Choose a text PDF' }).waitFor();
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
      name: 'canary.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(makeTextPdf(sharedText(`fixtures/canary/${canary.document}`))),
    });
    await expect(page.getByTestId('skeleton-preview')).toContainText('Earnings Statement');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('inference-badge')).toBeVisible();
    // The canary document's own values are on screen (on device), which proves the flow processed it.
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,487.50');
    await page.getByRole('button', { name: 'Confirm all found values' }).click();
    await page.getByRole('button', { name: 'Check these values' }).click();
    await page.getByRole('button', { name: /^Use .* as my yearly income$/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();

    expect(requests.some((r) => new URL(r.url()).hostname === AI_HOST), 'the cloud path really ran').toBe(true);
    for (const r of requests) {
      const haystack = [r.url(), JSON.stringify(await r.allHeaders()), r.postData() ?? ''].join('\n');
      for (const value of canary.canaries) expect(haystack.includes(value), `${value} leaked in ${r.method()} ${r.url()}`).toBe(false);
    }
  });

  test('on-device path (fake Chrome LanguageModel): pointers come from the device and nothing is sent', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: paystub': JSON.stringify(fixturePointers('paystub-en-01-correct')) } });
    const requests = recordRequests(page);
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await expect(page.getByText('Your device reads this silhouette first.')).toBeVisible();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(page.getByTestId('inference-badge')).toContainText('On this device');
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
    expect(requests.filter((r) => new URL(r.url()).origin !== new URL(page.url()).origin)).toEqual([]);
  });

  test('photo path (fake on-device model): ONLY_ON_DEVICE transcription, then the same silhouette', async ({ page, context }) => {
    await fakeOnDeviceModel(context, {
      availability: 'available',
      replies: { 'Transcribe this paystub photo': sharedText('samples/paystub-en-01.txt'), 'Document type: paystub': '{"grossPay":"N12"}' },
    });
    const requests = recordRequests(page);
    await page.goto('/#/doc');
    await expect(page.getByTestId('photo-option')).toHaveAttribute('data-status', 'available');
    const png = readFileSync(new URL('../public/icon-192.png', import.meta.url)); // any real PNG
    await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name: 'stub.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'photo-never-leaves');
    await expect(page.getByTestId('skeleton-preview')).toContainText('Gross Pay');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
    expect(requests.filter((r) => new URL(r.url()).origin !== new URL(page.url()).origin)).toEqual([]);
  });

  test('model status: downloadable → download after a click, with progress → available', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'downloadable', replies: {} });
    await page.goto('/#/doc');
    const status = page.getByTestId('model-status');
    await expect(status).toHaveAttribute('data-status', 'downloadable');
    await status.getByRole('button', { name: 'Download the on-device model' }).click();
    await expect(status).toHaveAttribute('data-status', 'available');
  });

  test('the model download does not depend on a task prompt fitting the device model', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'downloadable', replies: {}, initialPromptTooLarge: true });
    await page.goto('/#/doc');
    const status = page.getByTestId('model-status');
    await status.getByRole('button', { name: 'Download the on-device model' }).click();
    await expect(status).toHaveAttribute('data-status', 'available');
    await expect(status.getByRole('alert')).toHaveCount(0);
  });

  test('Korean payslip goes to the cloud as a silhouette; the user picks the pay frequency to annualize', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('payslip-ko-01-correct') });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'Korean payslip (PDF)' }).click();
    await expect(page.getByTestId('skeleton-preview')).toContainText('지급합계');
    await expect(page.getByTestId('skeleton-preview')).not.toContainText('김지원');
    await expect(page.getByTestId('model-status')).toContainText("does not support this document's language");
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('value-grossPay')).toHaveText('2,485,000');
    expect(cloud.bodies[0]).not.toContain('2,485,000');
    await page.getByRole('button', { name: 'Confirm all found values' }).click();
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByText('Choose how often you are paid to work out a yearly income.')).toBeVisible();
    await page.getByRole('button', { name: 'Change: How often you are paid' }).click();
    await page.getByTestId('field-payFrequency').getByRole('combobox').selectOption('monthly');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByTestId('annual-income')).toHaveAttribute('data-amount', '29820000');
  });

  test('an App Check rejection is shown honestly and the user can type the numbers instead', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, {
      status: 401,
      body: { error: { code: 401, message: 'Firebase App Check token is invalid.', status: 'UNAUTHENTICATED' } },
    });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('task-error')).toHaveAttribute('data-kind', 'app-check');
    await page.getByRole('button', { name: 'Type the numbers instead' }).click();
    await expect(page.getByTestId('value-grossPay')).toHaveText('Not found');
  });

  test('manual entry with no model at all', async ({ page }) => {
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'Type the numbers yourself' }).first().click();
    await page.getByRole('button', { name: 'Change: Gross pay this period' }).click();
    await page.getByTestId('field-grossPay').getByRole('textbox').fill('2,500.00');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Change: How often you are paid' }).click();
    await page.getByTestId('field-payFrequency').getByRole('combobox').selectOption('biweekly');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByTestId('annual-income')).toHaveAttribute('data-amount', '65000');
  });
});

/**
 * The record lists `models` model requests. After the first one, the app fetches its settings
 * (Remote Config, with an installation id); those are the only other entries allowed.
 */
async function expectOnlyModelAndSettings(page: import('@playwright/test').Page, models: number) {
  const list = page.getByTestId('outbound-list');
  await expect(list.locator('li[data-channel="ai-cloud"]')).toHaveCount(models);
  const channels = await list.locator('li').evaluateAll((items) => items.map((li) => li.getAttribute('data-channel')));
  expect(channels.filter((c) => c !== 'ai-cloud' && c !== 'remote-config')).toEqual([]);
}
