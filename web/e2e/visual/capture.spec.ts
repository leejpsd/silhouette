// Captures every screen and state for design review (npm run capture): 390 px in light and dark;
// Start, a question and Results also at 320 x 568, the tablet layout at 768 px and the wide layout at 960, 1280, 1440 and 1920 px,
// in English and Spanish, light and dark. Files go to
// visual-captures/ (git-ignored). The model, Remote Config and the device model are the app's own
// test fakes, so nothing leaves the machine.
import { test, type BrowserContext, type Page } from '@playwright/test';
import { chooseLanguage, completeQuickCheck, confirmAllValues, openDeleteEverything, type FlowAnswers } from '../helpers';
import { fakeAnswerModels, fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel, seedRemoteConfig } from '../model-fakes';

const OUT = 'visual-captures';
const ALL_ON = { feature_grounding_search: 'true', feature_grounding_maps: 'true', feature_tts: 'true' };
type Theme = 'light' | 'dark';

async function shot(page: Page, name: string, theme: Theme, full = true) {
  await page.waitForTimeout(200);
  const viewport = page.viewportSize();
  if (full && viewport) {
    // A tall viewport instead of a stitched full page, so the pinned block sits at the bottom as on a phone.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: viewport.width, height: Math.max(height, viewport.height) });
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${OUT}/${name}-${theme}.png`, animations: 'disabled' });
  if (full && viewport) await page.setViewportSize(viewport);
}

async function setup(page: Page, context: BrowserContext, theme: Theme, opts: { device?: boolean; flags?: boolean; reply?: (p: string) => string; hang?: boolean; error?: boolean } = {}) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  if (opts.device) await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Result from the rules': 'The rules say probably not: the residency rule is not met. Your income is under the limit for a household of 3.', 'Program: Test': 'A short explanation written on this device.' } });
  else await noOnDeviceModel(context);
  if (opts.flags) await seedRemoteConfig(context, ALL_ON);
  return fakeAnswerModels(
    page,
    {
      ...(opts.reply ? { text: opts.reply } : {}),
      ...(opts.hang ? { hang: true } : {}),
      ...(opts.error ? { error: { status: 429, message: 'Quota exceeded for metric: generate_requests_per_model_per_day, limit: 500' } } : {}),
    },
    opts.flags ? ALL_ON : {},
  );
}

async function program(page: Page, id: string) {
  await page.goto(`/#/program/${id}`);
  await page.getByTestId('verdict-card').waitFor();
  await page.getByTestId('why-section').waitFor();
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`390 px, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('start, questions and results', async ({ page, context }) => {
      await setup(page, context, theme);
      await page.goto('/');
      await shot(page, '01-start', theme, false);
      await page.getByRole('button', { name: 'Start Quick Check' }).click();
      await shot(page, '02-question-number', theme, false);
      await page.getByRole('button', { name: 'Next' }).click();
      await shot(page, '03-question-error', theme, false);
      await page.goto('/#/q/hasEarnedIncome');
      await shot(page, '04-question-tiles', theme, false);
      await page.goto('/#/q/income');
      await page.getByLabel('I know the exact amount').check();
      await page.getByLabel('Yearly household income').fill('28000.50');
      await shot(page, '05-question-income', theme, false);
      await page.goto('/#/q/benefits');
      await page.getByLabel('Food benefits (SNAP)', { exact: true }).check();
      await shot(page, '06-question-multi', theme, false);
      await page.goto('/#/q/residentStatus');
      await page.getByLabel('Yes', { exact: true }).check();
      await shot(page, '07-question-sensitive', theme, false);
      await page.goto('/#/results');
      await shot(page, '08-results-before-answers', theme, false);
      await page.goto('/');
      await completeQuickCheck(page, { income: { band: '$30,000 to $44,999' } } as Partial<FlowAnswers>);
      await shot(page, '09-results', theme);
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await shot(page, '10-results-offline', theme, false);
      await context.setOffline(false);
    });

    test('results with nothing that fits', async ({ page, context }) => {
      await setup(page, context, theme);
      await page.goto('/');
      await completeQuickCheck(page, { hasEarnedIncome: 'No', income: { band: '$60,000 or more' }, housing: 'Something else', benefits: [], hasOlderMember: 'No', resident: 'No' } as Partial<FlowAnswers>);
      await shot(page, '11-results-none', theme);
    });

    test('program detail and answers', async ({ page, context }) => {
      await setup(page, context, theme);
      await page.goto('/');
      await completeQuickCheck(page);
      await program(page, 'work-credit');
      await shot(page, '12-program', theme);
      await page.getByRole('button', { name: 'Explain this program' }).click();
      await page.getByText('Show the exact request').click();
      await shot(page, '13-send-step', theme);
      await page.getByRole('button', { name: 'Send' }).click();
      await page.getByTestId('explain-short').getByTestId('answer').waitFor();
      await page.getByRole('button', { name: 'How do I apply?' }).click();
      await page.getByTestId('chip-apply').getByTestId('answer').waitFor();
      await shot(page, '14-program-answers', theme);
      await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
      await page.getByText('Show exactly what was sent').first().click();
      await shot(page, '15-record', theme, false);
    });

    test('blocked, daily limit, loading and cancelled', async ({ page, context }) => {
      await setup(page, context, theme, { reply: () => 'You may qualify for this program.' });
      await page.goto('/');
      await completeQuickCheck(page, { resident: 'No' } as Partial<FlowAnswers>);
      await program(page, 'food-help');
      await page.getByRole('button', { name: 'Explain this program' }).click();
      await page.getByRole('button', { name: 'Send' }).click();
      await page.getByTestId('answer-error').waitFor();
      await shot(page, '16-program-unlikely-blocked', theme);
    });

    test('daily limit', async ({ page, context }) => {
      await setup(page, context, theme, { error: true });
      await page.goto('/');
      await completeQuickCheck(page);
      await program(page, 'utility-discount');
      await page.getByRole('button', { name: 'Explain this program' }).click();
      await page.getByRole('button', { name: 'Send' }).click();
      await page.getByTestId('answer-error').waitFor();
      await shot(page, '17-daily-limit', theme);
    });

    test('loading and cancelled', async ({ page, context }) => {
      await setup(page, context, theme, { hang: true });
      await page.goto('/');
      await completeQuickCheck(page);
      await program(page, 'utility-discount');
      await page.getByRole('button', { name: 'Explain this program' }).click();
      await page.getByRole('button', { name: 'Send' }).click();
      await shot(page, '18-loading', theme);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await shot(page, '19-cancelled', theme);
    });

    test('with a device model: own result, typed question', async ({ page, context }) => {
      await setup(page, context, theme, { device: true });
      await page.goto('/');
      await completeQuickCheck(page, { resident: 'No' } as Partial<FlowAnswers>);
      await program(page, 'food-help');
      await page.getByRole('button', { name: 'Explain my result on this device' }).click();
      await page.getByTestId('why-answer').waitFor();
      await shot(page, '20-why-on-device', theme);
    });

    test('flags on: current information, leads, places, read aloud', async ({ page, context }) => {
      await setup(page, context, theme, { flags: true });
      await page.goto('/');
      await completeQuickCheck(page);
      await program(page, 'utility-discount');
      await page.getByRole('button', { name: /Check current information/ }).click();
      await page.getByTestId('send-decision').getByRole('button', { name: 'Send' }).click();
      await page.getByTestId('current-line').waitFor();
      await shot(page, '21-current-information', theme);
      await page.goto('/#/discover');
      await page.getByRole('button', { name: 'Look for other help' }).click();
      await page.getByRole('button', { name: 'Send' }).click();
      await page.getByTestId('leads').waitFor();
      await shot(page, '22-leads', theme);
      await page.goto('/#/nearby');
      await page.getByLabel('Your county').selectOption('testshire');
      await page.getByRole('button', { name: 'Find help near the county center' }).click();
      await page.getByRole('button', { name: 'Send' }).click();
      await page.getByTestId('places').waitFor();
      await shot(page, '23-places', theme);
    });

    test('flags off pages', async ({ page, context }) => {
      await setup(page, context, theme);
      await page.goto('/');
      await completeQuickCheck(page);
      await page.goto('/#/discover');
      await shot(page, '24-discover-off', theme);
      await page.goto('/#/nearby');
      await shot(page, '25-nearby-off', theme);
    });

    test('documents', async ({ page, context }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await noOnDeviceModel(context);
      await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
      await page.goto('/#/doc');
      await page.getByTestId('model-status').waitFor();
      await shot(page, '26-add-document', theme);
      await page.getByRole('button', { name: 'English paystub (text)' }).click();
      await page.getByTestId('skeleton-preview').waitFor();
      await shot(page, '27-preview-leave', theme);
      await page.getByRole('button', { name: 'On this phone' }).click();
      await shot(page, '28-preview-phone', theme);
      await page.getByRole('button', { name: 'What could leave' }).click();
      await page.getByRole('button', { name: 'Hide “Federal”' }).first().click();
      await shot(page, '29-preview-hidden', theme);
      await page.getByRole('button', { name: 'Show “federal” again' }).click();
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByTestId('inference-badge').waitFor();
      await shot(page, '30-review', theme);
      await confirmAllValues(page);
      await page.getByRole('button', { name: 'Check these values' }).click();
      await page.getByTestId('validation').waitFor();
      await shot(page, '31-review-checks', theme);
    });

    test('not a paystub', async ({ page, context }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await noOnDeviceModel(context);
      await fakeCloudModel(page, { pointers: {} });
      await page.goto('/#/doc');
      await page.getByRole('button', { name: 'English paystub (text)' }).click();
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByTestId('not-a-document').waitFor();
      await shot(page, '32-not-a-paystub', theme);
    });

    test('sheets', async ({ page, context }) => {
      await setup(page, context, theme);
      await page.goto('/');
      await page.getByTestId('language-button').click();
      await shot(page, '33-language', theme, false);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'More' }).click();
      await shot(page, '34-demo-rules', theme, false);
      await page.keyboard.press('Escape');
      const dialog = await openDeleteEverything(page, 'demo');
      await shot(page, '35-delete', theme, false);
      await dialog.getByRole('button', { name: 'Delete everything' }).click();
      await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
      await shot(page, '36-record-deleted', theme, false);
    });
  });
}

for (const width of [320, 768, 960, 1280, 1440, 1920] as const) {
  for (const theme of width === 320 ? (['light'] as const) : (['light', 'dark'] as const)) {
    for (const lang of ['en', 'es'] as const) {
      test(`${width} px, ${theme}, ${lang}: start, question, results`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : width === 768 ? 1024 : width >= 1440 ? 900 : 800 });
        await setup(page, context, theme);
        await page.goto('/');
        if (lang === 'es') await chooseLanguage(page, 'es');
        await shot(page, `40-${width}-${lang}-start`, theme, false);
        await page.goto('/#/q/income');
        await page.getByRole('radio').first().check();
        await shot(page, `41-${width}-${lang}-question`, theme, false);
        await page.goto('/');
        if (lang === 'es') await chooseLanguage(page, 'en');
        await completeQuickCheck(page, { income: { band: '$30,000 to $44,999' } } as Partial<FlowAnswers>);
        if (lang === 'es') await chooseLanguage(page, 'es');
        await shot(page, `42-${width}-${lang}-results`, theme, false);
        if (width === 320) return;
        await program(page, 'work-credit');
        await shot(page, `43-${width}-${lang}-program`, theme, false);
        await page.getByTestId('language-button').click();
        await shot(page, `44-${width}-${lang}-language`, theme, false);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: lang === 'es' ? 'Explicar este programa' : 'Explain this program' }).click();
        await shot(page, `45-${width}-${lang}-send-step`, theme, false);
        await page.getByTestId('bottom-block').getByRole('button', { name: /^(Details|Detalles)$/ }).click();
        await shot(page, `46-${width}-${lang}-record`, theme, false);
      });
    }
  }
}

for (const width of [960, 1440] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${width} px, ${theme}: documents`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await noOnDeviceModel(context);
      await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
      await page.goto('/#/doc');
      await page.getByTestId('model-status').waitFor();
      await shot(page, `47-${width}-add-document`, theme, false);
      await page.getByRole('button', { name: 'English paystub (text)' }).click();
      await page.getByTestId('skeleton-preview').waitFor();
      await shot(page, `48-${width}-preview`, theme, false);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByTestId('inference-badge').waitFor();
      await shot(page, `49-${width}-review`, theme, false);
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`kept on this device, and short screens (${theme})`, async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: paystub': JSON.stringify(fixturePointers('paystub-en-01-correct')) } });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByTestId('inference-badge').waitFor();
    await page.getByTestId('more-values').click();
    await shot(page, '37-review-more-open', theme);
    await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
    await shot(page, '38-record-kept', theme, false);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/#/q/income');
    await page.getByLabel('I know the exact amount').check();
    await page.getByLabel('Yearly household income').fill('28000.50');
    await shot(page, '39-income-exact-360x640', theme, false);
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 768, 1280] as const) {
    test(`${width} px, ${theme}: judges and the on-device check`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 800 });
      await setup(page, context, theme);
      await page.goto('/#/judges');
      await page.getByTestId('judges-device').waitFor();
      await shot(page, `50-${width}-judges`, theme, false);
      await page.goto('/#/device-check');
      await page.getByTestId('no-model').waitFor();
      await page.locator('input[type="file"]').setInputFiles({
        name: 'recording.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            kind: 'silhouette-device-check',
            version: 1,
            date: '2026-11-17T09:30:00.000Z',
            browser: 'Chrome 142.0.7444.59',
            platform: 'macOS',
            userAgent: 'example',
            availability: { languageModel: 'present', 'text en (answers)': 'available' },
            jurisdiction: 'zz-test',
            cases: [
              { id: 'pointers: bundled sample', task: 'document.pointer.extract', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 4200, outputCheck: null, fields: { correct: 11, total: 11 } },
              { id: 'explanation (en)', task: 'explain.short', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 2300, outputCheck: 'passed' },
              { id: 'typed question (en)', task: 'ask.freeText', mode: 'ONLY_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 1900, outputCheck: 'passed' },
            ],
          }),
        ),
      });
      await page.getByTestId('recording-note').waitFor();
      await shot(page, `51-${width}-device-check-recording`, theme);
    });
  }
}
