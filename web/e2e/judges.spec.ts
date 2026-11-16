// The judges' path and the on-device check, in browsers with and without the on-device model.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fakeAnswerModels, fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

test.describe('for judges: try it in two minutes', () => {
  test('is reached from the demo-rules sheet and works without an on-device model', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/');
    await page.getByTestId('demo-banner').getByRole('button', { name: 'More' }).click();
    await page.getByTestId('judges-link').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Try it in two minutes');
    await expect(page.getByTestId('judges-device')).toHaveAttribute('data-device', 'other');
    await expect(page.getByTestId('judges-device')).toContainText('sends the silhouette (never the values)');

    // 1. A prepared household: results from the rules on this device, nothing sent.
    await page.getByRole('button', { name: 'Fill in and see the results' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');

    // 2. The sample paystub's silhouette, then Send (the cloud, silhouette only).
    await page.goto('/#/judges');
    await page.getByRole('button', { name: 'Open the sample paystub' }).click();
    await expect(page.getByTestId('skeleton-preview')).toHaveAttribute('data-mode', 'leave');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    expect(cloud.bodies.length).toBeGreaterThan(0);
    expect(cloud.bodies.join('\n')).not.toContain('1,271.88');

    // 3. What left, compared.
    await page.goto('/#/judges');
    await page.getByRole('button', { name: 'Open “Leaving your device”' }).click();
    const record = page.getByTestId('record-sheet');
    await expect(record).toBeVisible();
    await expect(record.getByTestId('outbound-list')).toContainText('Document silhouette');
  });

  test('says which steps run on this device when a model is present', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: {} });
    await page.goto('/#/judges');
    await expect(page.getByTestId('judges-device')).toHaveAttribute('data-device', 'available');
    await expect(page.getByTestId('judges-device')).toContainText('the fields are found on this device');
  });
});

test.describe('the on-device check', () => {
  test('without a model it does not run, and a recording is labelled as one with its date and machine', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    await expect(page.getByTestId('no-model')).toBeVisible();
    await expect(page.getByTestId('run-device-check')).toHaveCount(0);
    const recording = {
      kind: 'silhouette-device-check',
      version: 1,
      date: '2026-11-17T09:30:00.000Z',
      browser: 'Chrome 142.0.7444.59',
      platform: 'macOS',
      userAgent: 'x',
      availability: { languageModel: 'present' },
      jurisdiction: 'zz-test',
      cases: [
        { id: 'pointers: bundled sample', task: 'document.pointer.extract', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 4200, outputCheck: null, fields: { correct: 11, total: 11 } },
        { id: 'explanation (en)', task: 'explain.short', mode: 'PREFER_ON_DEVICE', ran: 'IN_CLOUD', latencyMs: 900, outputCheck: 'passed' },
      ],
    };
    await page.locator('input[type="file"]').setInputFiles({ name: 'run.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(recording)) });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recorded on\u2011device check');
    await expect(page.getByTestId('recording-meta')).toHaveText('Recorded 2026-11-17 · Chrome 142.0.7444.59 · macOS');
    await expect(page.getByTestId('recording-note')).toContainText('This is a recording, not a live run.');
    await expect(page.getByTestId('device-summary')).toContainText('1 of 2 ran on this device; 1 in the cloud; 0 did not run. Extraction: 11 of 11 fields correct.');
    await expect(page.locator('tr[data-ran="IN_CLOUD"]')).toContainText('In the cloud (fallback)');
  });

  test('with a model it runs every case, reports where each ran, and offers the results as a file', async ({ page, context }) => {
    const correct = fixturePointers('paystub-en-01-correct') as Record<string, unknown>;
    // The device's reading breaks the paystub's arithmetic: it fails the checks and is repeated in the cloud.
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: paystub': JSON.stringify({ ...correct, netPay: correct['grossPay'] }) } });
    await fakeAnswerModels(page, { text: (p) => (p.includes('Document type: paystub') ? JSON.stringify(correct) : 'A short answer about the program.') });
    await page.goto('/#/device-check');
    await page.getByTestId('run-device-check').click();
    await expect(page.getByTestId('device-check-status')).toHaveText('Finished.', { timeout: 30_000 });
    const rows = page.locator('.device-table tbody tr');
    await expect(rows).toHaveCount(14);
    await expect(page.locator('tr[data-ran="ON_DEVICE"]').first()).toBeVisible();
    await expect(page.getByTestId('device-summary')).toContainText('ran on this device');
    // Version 2: what the person ends up with, and the device's answer field by field.
    await expect(page.getByTestId('device-summary-final')).toContainText('5 extraction cases were repeated in the cloud');
    const detail = page.getByTestId('field-detail').first();
    await detail.locator('summary').click();
    await expect(detail).toContainText('netPay');
    await expect(detail).toContainText('check:net-sum');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download results' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^device-check-\d{4}-\d{2}-\d{2}-[a-z]+\d+-[a-z0-9]+\.json$/);
    const saved = JSON.parse(readFileSync(await file.path(), 'utf8')) as { version: number; cases: { device?: { fields: { field: string; gold: string[]; answered: string[]; status: string }[] } }[] };
    expect(saved.version).toBe(2);
    const fields = saved.cases[0]?.device?.fields ?? [];
    expect(fields.find((f) => f.field === 'netPay')).toMatchObject({ status: 'wrong' });
    // Placeholder ids only, never document values.
    expect(JSON.stringify(saved)).not.toContain('1,271.88');
  });

  test('the first recorded run (version 1) still opens and replays', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    await page.getByRole('button', { name: /Show the recording of device-check-2026-11-16/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recorded on\u2011device check');
    await expect(page.getByTestId('device-summary')).toContainText('14 of 14 ran on this device');
    await expect(page.getByTestId('device-summary')).toContainText('37 of 60 fields correct');
  });
});
