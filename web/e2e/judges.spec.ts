// The judges' path and the on-device check, in browsers with and without the on-device model.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { chooseLanguage, confirmAllValues } from './helpers';
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
    await expect(page.getByTestId('judges-device')).toContainText('sending the silhouette (never the values)');

    // 1. The sample paystub of an invented household: its silhouette, then Send (the cloud, silhouette only).
    await page.getByRole('button', { name: 'Read the sample paystub' }).click();
    await expect(page.getByTestId('skeleton-preview')).toHaveAttribute('data-mode', 'leave');
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    expect(cloud.bodies.length).toBeGreaterThan(0);
    expect(cloud.bodies.join('\n')).not.toContain('1,271.88');

    // 2. The results it sharpens: they say the yearly income was read from the paystub, and how.
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    // The next step is offered only once the income is in the results.
    await expect(page.getByTestId('judge-next-3')).toHaveCount(0);
    await page.getByRole('button', { name: /^Use \$[\d,]+ as my yearly income$/ }).click();
    await expect(page.getByTestId('results-source')).toHaveAttribute('data-income-from', 'IN_CLOUD');
    await expect(page.getByTestId('income-from')).toContainText('by Firebase AI Logic in the cloud, from the silhouette only');
    // How the yearly income was worked out, said with the results, and a way to change it.
    await expect(page.getByTestId('income-basis')).toHaveAttribute('data-method', 'ytd');
    await expect(page.getByTestId('income-basis')).toContainText('worked out from the year-to-date gross pay: $23,103.25 through');
    await expect(page.getByTestId('income-basis')).toContainText('so this is a projection');
    // What the paystub changed, first: the yearly income, the question it answered, the results it changed
    // (each row says what it was), and who decided.
    // The results are said to be the invented sample household's, not the visitor's; the reasons say so too.
    await expect(page.getByTestId('sample-household')).toContainText('Sample household, not you');
    // Wide screens show the first program beside the list: its reasons say whose answers they use.
    if (test.info().project.name !== 'phone') await expect(page.getByTestId('why-lead').first()).toContainText("using the sample household's answers");
    const effect = page.getByTestId('doc-effect');
    await expect(effect).toContainText('What your paystub changed');
    await expect(effect.getByTestId('doc-filled')).toContainText('Yearly income');
    await expect(effect.getByTestId('who-decided')).toContainText('The rules on this device decided each result');
    const changed = Number(await effect.getByTestId('doc-changes').getAttribute('data-count'));
    expect(changed).toBeGreaterThan(0);
    await expect(page.locator('[data-document-changed="true"]')).toHaveCount(changed);
    await expect(page.getByTestId('judge-next-3').first()).toBeVisible();
    await expect(page.getByTestId('judge-next-1')).toHaveCount(0);

    // 3. What left, compared.
    await page.goto('/#/judges');
    await page.getByRole('button', { name: 'Open “Leaving your device”' }).click();
    const record = page.getByTestId('record-sheet');
    await expect(record).toBeVisible();
    await expect(record.getByTestId('outbound-list')).toContainText('Document silhouette');
  });

  test('without a model and without sending anything: the same paystub as the on-device model read it (a recording)', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/#/judges');
    await page.getByRole('button', { name: 'Read the sample paystub' }).click();
    await page.getByTestId('use-recorded').click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'RECORDED');
    await expect(page.getByTestId('pointer-answer')).toHaveText(/"grossPay": "N\d+"/);
    // The same line twice: as the model saw it (placeholders only) and on this device (the value marked).
    const modelLine = page.getByTestId('pointer-line-model');
    await expect(modelLine).toContainText('Gross Pay');
    await expect(modelLine.locator('.line-tok-ref')).toHaveText(/^N\d+$/);
    await expect(modelLine).not.toContainText('1,271.88');
    await expect(page.getByTestId('pointer-line-device').locator('mark')).toHaveText('1,271.88');
    await expect(page.getByTestId('pointer-value')).toHaveText('1,271.88');
    await expect(page.getByTestId('pointer-reveal')).toContainText('(a recorded reading)');
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    // The recorded answer has no deductions (the device reads them in a second part): it says so, and
    // "gross minus deductions = net" is not shown as a problem.
    await expect(page.locator('.check[data-check="net-sum"]')).toHaveCount(0);
    await page.getByRole('button', { name: /^Use \$[\d,]+ as my yearly income$/ }).click();
    await expect(page.getByTestId('income-from')).toContainText('from a recorded on-device reading');
    await page.getByTestId('income-basis').locator('summary').click();
    await page.getByTestId('income-basis').getByRole('button', { name: 'Change the yearly income' }).click();
    await expect(page).toHaveURL(/#\/q\/income/);
    // Nothing left: no request to the model, nothing in the record.
    expect(cloud.bodies).toEqual([]);
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
  });

  test('in Spanish the judges page is all Spanish', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/judges');
    await chooseLanguage(page, 'es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pruébalo en dos minutos');
    await expect(page.getByRole('button', { name: 'Lee el talón de pago de ejemplo' })).toBeVisible();
    await expect(page.getByTestId('judges-device')).toContainText('Este navegador no tiene el modelo del dispositivo');
    const text = await page.locator('main').innerText();
    for (const english of ['Try it', 'Open the sample', 'Fill in and see', 'Compare what left', 'This browser', 'Three steps']) expect(text).not.toContain(english);
  });

  test('in Spanish the on-device check page is all Spanish, a recording included', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    await chooseLanguage(page, 'es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comprobación en el dispositivo');
    await page.locator(`[data-recording="${latestRecording().label}"]`).click();
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
    await page.locator(`[data-recording="${baseline.label}"]`).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recorded on\u2011device check');
    await expect(page.getByTestId('device-summary')).toContainText(`${baseline.onDevice} of ${baseline.total} on this device`);
    await expect(page.getByTestId('device-summary-first')).toContainText('37 of 60 fields correct');
  });

  test('the version 2 run from the history folder still opens with "Open a run file"', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/device-check');
    // Bundled: the baseline and the latest run in Chrome, and the two runs on an iPhone; earlier runs are kept in history/.
    await expect(page.locator('.recordings .chip-button')).toHaveCount(bundledRecordingCount());
    expect(bundledRecordingCount()).toBe(4);
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
    await page.locator(`[data-recording="${latest.label}"]`).click();
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

test.describe('why hybrid, measured', () => {
  test('"Where each task runs" shows the measured figures from the bundled runs and the cloud evaluation', async ({ page }) => {
    await page.goto('/#/tasks');
    const measured = page.getByTestId('tasks-measured');
    await expect(measured.getByRole('heading', { name: 'Why hybrid: what was measured' })).toBeVisible();
    const devices = measured.getByTestId('measured-device');
    await expect(devices).toHaveCount(2);
    // The iPhone: the readings its own checks rejected went to the cloud once, and no wrong value reached the person.
    const iphone = devices.filter({ hasText: 'iPhone 17 Pro' });
    await expect(iphone.getByTestId('measured-on-device')).toContainText('12 / 15');
    await expect(iphone.getByTestId('measured-fallback')).toContainText('3 / 15');
    await expect(iphone.getByTestId('measured-wrong')).toHaveAttribute('data-met', 'true');
    await expect(measured.getByTestId('measured-cloud-right')).toContainText('30 / 30');
    await expect(measured.getByTestId('measured-leaks')).toContainText('0 / 39');
    await expect(measured.getByTestId('measured-why')).toContainText('The cloud receives only the silhouette');
    // Each device's name opens its recording.
    await iphone.getByRole('button', { name: /iPhone 17 Pro/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recorded on‑device check');
  });
});

test.describe('how the routing is enforced', () => {
  test('"Where each task runs" says how ONLY_ON_DEVICE holds without a model, and shows the Remote Config values in use', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/tasks');
    const enforced = page.getByTestId('tasks-enforced');
    await expect(enforced).toContainText('the Firebase AI Logic SDK would send even an ONLY_ON_DEVICE request to the cloud');
    await expect(page.getByTestId('enforced-browser')).toHaveAttribute('data-status', 'unavailable');
    const config = page.getByTestId('tasks-config');
    await expect(config).toHaveAttribute('data-source', 'defaults');
    await expect(config).toContainText('route_short_text_max_words');
    await expect(config).toContainText('prompt_pointer_extract_v');
  });

  test('with a ready model, the page says so', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: {} });
    await page.goto('/#/tasks');
    await expect(page.getByTestId('enforced-browser')).toHaveAttribute('data-status', 'available');
  });
});
