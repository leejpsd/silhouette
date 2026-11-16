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
    await expect(page.getByTestId('judges-device')).toContainText('the silhouette is read on this device first');
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
    await expect(page.getByTestId('device-summary')).toContainText('1 of 2 on this device; 0 in the cloud after a failed on-device attempt; 1 in the cloud; 0 did not run.');
    await expect(page.getByTestId('device-summary-first')).toContainText('11 of 11 fields correct');
    await expect(page.locator('tr[data-ran="IN_CLOUD"]')).toContainText('In the cloud (fallback)');
  });

  test('with a model it runs every case in two parts, reports where each was finally answered, and offers the results as a file', async ({ page, context }) => {
    const correct = fixturePointers('paystub-en-01-correct') as Record<string, unknown>;
    const { deductions, ...core } = correct;
    void deductions;
    // The device reads the core right and returns no deductions: the core is used, the deductions are not read.
    await fakeOnDeviceModel(context, {
      availability: 'available',
      systemReplies: { 'answer only the fields in the schema': JSON.stringify({ ...core, netPayPay: 'N1' }), 'answer only the deductions': JSON.stringify({ deductions: [] }) },
      replies: {},
    });
    await fakeAnswerModels(page, { text: (p) => (p.includes('Document type: paystub') ? JSON.stringify(correct) : 'A short answer about the program.') });
    await page.goto('/#/device-check');
    await page.getByTestId('run-device-check').click();
    await expect(page.getByTestId('device-check-status')).toHaveText('Finished.', { timeout: 30_000 });
    const rows = page.locator('.device-table tbody tr');
    await expect(rows).toHaveCount(14);
    // The bundled sample: answered on this device, with the deductions not read.
    await expect(rows.first()).toHaveAttribute('data-ran', 'ON_DEVICE');
    await expect(rows.first()).toContainText('deductions not read');
    await expect(page.getByTestId('device-summary')).toContainText('Where each case was finally answered:');
    await expect(page.getByTestId('device-summary-first')).toContainText('First attempt: 14 of 14 were tried on this device.');
    const detail = page.getByTestId('field-detail').first();
    await detail.locator('summary').click();
    await expect(detail.getByTestId('device-pass-core')).toContainText('keys ignored: netPayPay');
    await expect(detail.getByTestId('device-pass-deductions')).toContainText('check:net-sum');
    // The strict constraint reached the device through Firebase AI Logic, one per part.
    const constraints = (await page.evaluate(() => (window as unknown as { __fakeConstraints: string[] }).__fakeConstraints))
      .map((c) => JSON.parse(c) as { properties?: Record<string, unknown>; additionalProperties?: boolean; required?: string[] } | null)
      .filter((c) => c?.properties?.['grossPay'] !== undefined || c?.properties?.['deductions'] !== undefined);
    expect(constraints.length).toBeGreaterThanOrEqual(2);
    const coreConstraint = constraints.find((c) => c?.properties?.['grossPay'] !== undefined);
    expect(coreConstraint).toMatchObject({ additionalProperties: false });
    expect(coreConstraint?.required).toHaveLength(11);
    expect(constraints.find((c) => c?.properties?.['deductions'] !== undefined)).toMatchObject({ additionalProperties: false, required: ['deductions'] });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download results' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^device-check-\d{4}-\d{2}-\d{2}T\d{4}-[a-z]+\d+-[a-z0-9]+\.json$/);
    type Saved = {
      version: number;
      cases: { ran: string; first?: { ran: string }; final?: { deductionsNotRead?: boolean }; device?: { core?: { correct: number; total: number }; deductions?: string; deductionsNotRead?: boolean; passes?: { part: string; extraKeys: string[]; latencyMs: number }[] } }[];
    };
    const saved = JSON.parse(readFileSync(await file.path(), 'utf8')) as Saved;
    expect(saved.version).toBe(3);
    const sample = saved.cases[0];
    expect(sample).toMatchObject({ ran: 'ON_DEVICE', first: { ran: 'ON_DEVICE' }, final: { deductionsNotRead: true } });
    expect(sample?.device).toMatchObject({ core: { correct: 11, total: 11 }, deductions: 'missing', deductionsNotRead: true });
    expect(sample?.device?.passes?.map((p) => p.part)).toEqual(['core', 'deductions']);
    expect(sample?.device?.passes?.[0]?.extraKeys).toEqual(['netPayPay']);
    // Placeholder ids only, never document values.
    expect(JSON.stringify(saved)).not.toContain('1,271.88');
  });

  test('the first recorded run (version 1) still opens and replays', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    await page.getByRole('button', { name: 'Show the recording of device-check-2026-11-16-chrome157-macos' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recorded on\u2011device check');
    await expect(page.getByTestId('device-summary')).toContainText('14 of 14 on this device');
    await expect(page.getByTestId('device-summary-first')).toContainText('37 of 60 fields correct');
  });

  test('the second recorded run (version 2) counts where each case was finally answered', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    await page.getByRole('button', { name: 'Show the recording of device-check-2026-11-16T1744-chrome157-macos' }).click();
    await expect(page.getByTestId('device-summary')).toContainText('9 of 14 on this device; 5 in the cloud after a failed on-device attempt; 0 in the cloud; 0 did not run.');
    await expect(page.getByTestId('device-summary-first')).toContainText('First attempt: 14 of 14 were tried on this device. Extraction, first answer: 48 of 60 fields correct.');
    await expect(page.getByTestId('device-summary-final')).toContainText('60 of 60 fields correct; 5 extraction cases were repeated in the cloud.');
    await expect(page.locator('tr[data-ran="IN_CLOUD"]').first()).toContainText('In the cloud, after a failed on');
  });
});
