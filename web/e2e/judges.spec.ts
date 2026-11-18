// The judges' path and the on-device check, in browsers with and without the on-device model.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { chooseLanguage } from './helpers';
import { baselineRecording, bundledRecordingCount, latestRecording } from './recordings';
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
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
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

  test('in Spanish the judges page is all Spanish', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/judges');
    await chooseLanguage(page, 'es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pruébalo en dos minutos');
    await expect(page.getByRole('button', { name: 'Abrir el talón de pago de ejemplo' })).toBeVisible();
    await expect(page.getByTestId('judges-device')).toContainText('Este navegador no tiene el modelo del dispositivo');
    const text = await page.locator('main').innerText();
    for (const english of ['Try it', 'Open the sample', 'Fill in and see', 'Compare what left', 'This browser', 'Three steps']) expect(text).not.toContain(english);
  });

  test('in Spanish the on-device check page is all Spanish, a recording included', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    await chooseLanguage(page, 'es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comprobación en el dispositivo');
    await page.getByRole('button', { name: `Mostrar la grabación ${latestRecording().label}`, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comprobación en el dispositivo grabada');
    await expect(page.getByTestId('headline-on-device')).toContainText('casos respondidos en el dispositivo que hizo esta grabación');
    const text = await page.locator('main').innerText();
    for (const english of ['Recorded', 'cases answered', 'Where each case', 'First attempt', 'Download results', 'Open a run file', 'Runs a fixed set', 'This is a recording']) expect(text).not.toContain(english);
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
    await expect(page.getByTestId('device-summary-income')).toContainText(/over 5 readings: all right in \d; some not found \(left empty, none wrong\) in \d; some wrong in \d\./);
    await expect(page.getByTestId('device-summary-wrong')).toContainText(/Readings in which any value reached the person wrong: \d of 5\./);
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
      cases: { ran: string; first?: { ran: string }; final?: { deductionsNotRead?: boolean; incomeInputsCorrect?: boolean }; device?: { core?: { correct: number; total: number }; deductions?: string; deductionsNotRead?: boolean; passes?: { part: string; extraKeys: string[]; latencyMs: number }[] } }[];
    };
    const saved = JSON.parse(readFileSync(await file.path(), 'utf8')) as Saved;
    expect(saved.version).toBe(3);
    const sample = saved.cases[0];
    expect(sample).toMatchObject({ ran: 'ON_DEVICE', first: { ran: 'ON_DEVICE' }, final: { deductionsNotRead: true, incomeInputsCorrect: true } });
    expect(sample?.device).toMatchObject({ core: { correct: 11, total: 11 }, deductions: 'missing', deductionsNotRead: true });
    // The empty list did not add up: asked once more, then left out.
    expect(sample?.device?.passes?.map((p) => p.part)).toEqual(['core', 'deductions', 'deductions-again']);
    expect(sample?.device?.passes?.[0]?.extraKeys).toEqual(['netPayPay']);
    // Placeholder ids only, never document values.
    expect(JSON.stringify(saved)).not.toContain('1,271.88');
  });

  test('can run the extraction cases three times; each reading is recorded with its repetition', async ({ page, context }) => {
    const correct = fixturePointers('paystub-en-01-correct') as Record<string, unknown>;
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: paystub': JSON.stringify(correct) } });
    await fakeAnswerModels(page, { text: (p) => (p.includes('Document type: paystub') ? JSON.stringify(correct) : 'A short answer about the program.') });
    await page.goto('/#/device-check');
    await page.getByTestId('device-check-repeat').getByRole('checkbox').check();
    await page.getByTestId('run-device-check').click();
    await expect(page.getByTestId('device-check-status')).toHaveText('Finished.', { timeout: 60_000 });
    await expect(page.locator('.device-table tbody tr')).toHaveCount(24);
    await expect(page.getByTestId('device-summary-repetitions')).toContainText('Each extraction case was run 3 times');
    await expect(page.getByTestId('device-summary-income')).toContainText('over 15 readings');
    await expect(page.locator('.device-table tbody tr').nth(5)).toContainText('run 2 of 3');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download results' }).click();
    const saved = JSON.parse(readFileSync(await (await download).path(), 'utf8')) as { repetitions: number; cases: { id: string; repetition?: number }[] };
    expect(saved.repetitions).toBe(3);
    expect(saved.cases.filter((c) => c.id === 'pointers: bundled sample').map((c) => c.repetition)).toEqual([1, 2, 3]);
  });

  test('the first recorded run (version 1) still opens and replays', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    const baseline = baselineRecording();
    await page.getByRole('button', { name: `Show the recording of ${baseline.label}`, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recorded on\u2011device check');
    await expect(page.getByTestId('device-summary')).toContainText(`${baseline.onDevice} of ${baseline.total} on this device`);
    await expect(page.getByTestId('device-summary-first')).toContainText('37 of 60 fields correct');
  });

  test('the version 2 run from the history folder still opens with "Open a run file"', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    // Only the baseline and the latest run are bundled; earlier runs are kept in history/.
    await expect(page.locator('.recordings .chip-button')).toHaveCount(bundledRecordingCount());
    expect(bundledRecordingCount()).toBe(2);
    const file = new URL('../eval/results/on-device/history/device-check-2026-11-16T1744-chrome157-macos.json', import.meta.url);
    await page.locator('input[type="file"]').setInputFiles({ name: 'device-check-2026-11-16T1744-chrome157-macos.json', mimeType: 'application/json', buffer: readFileSync(file) });
    await expect(page.getByTestId('device-summary')).toContainText('9 of 14 on this device; 5 in the cloud after a failed on-device attempt; 0 in the cloud; 0 did not run.');
    await expect(page.getByTestId('device-summary-first')).toContainText('First attempt: 14 of 14 were tried on this device. Extraction, first answer: 48 of 60 fields correct.');
    await expect(page.getByTestId('device-summary-final')).toContainText('60 of 60 fields correct; 5 extraction cases were repeated in the cloud.');
    await expect(page.locator('tr[data-ran="IN_CLOUD"]').first()).toContainText('In the cloud, after a failed on');
  });

  test('the latest run shows its three numbers in the first screen at 390 px', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/device-check');
    const latest = latestRecording();
    await page.getByRole('button', { name: `Show the recording of ${latest.label}`, exact: true }).click();
    const expected: [string, string][] = [['headline-on-device', `${latest.onDevice} / ${latest.total}`]];
    if (latest.income) expected.push(['headline-income-right', `${latest.income.allRight} / ${latest.readings}`]);
    if (latest.wrongReachedPerson !== null) expected.push(['headline-wrong', `${latest.wrongReachedPerson} / ${latest.readings}`]);
    for (const [id, text] of expected) {
      const item = page.getByTestId(id);
      await expect(item).toContainText(text);
      await expect(item).toBeInViewport({ ratio: 1 });
    }
    // None reached the person wrong: shown as met. Readings with a value not found are counted beside the income line.
    if (latest.wrongReachedPerson === 0) await expect(page.getByTestId('headline-wrong')).toHaveAttribute('data-met', 'true');
    if (latest.income && latest.income.notFound > 0) await expect(page.getByTestId('headline-not-found')).toContainText(`${latest.income.notFound} with a value not found`);
  });
});
