// Captures every screen and state for design review (npm run capture): 390 px in light and dark;
// Start, a question and Results also at 320 px and 1280 px in English and Spanish. Files go to
// visual-captures/ (git-ignored). The model, Remote Config and the device model are the app's own
// test fakes, so nothing leaves the machine.
import { test, type BrowserContext, type Page } from '@playwright/test';
import { completeQuickCheck, type FlowAnswers } from '../helpers';
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
      await completeQuickCheck(page, { income: { band: '30,000 to 44,999' } } as Partial<FlowAnswers>);
      await shot(page, '09-results', theme);
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await shot(page, '10-results-offline', theme, false);
      await context.setOffline(false);
    });

    test('results with nothing that fits', async ({ page, context }) => {
      await setup(page, context, theme);
      await page.goto('/');
      await completeQuickCheck(page, { hasEarnedIncome: 'No', income: { band: '60,000 or more' }, housing: 'Something else', benefits: [], hasOlderMember: 'No', resident: 'No' } as Partial<FlowAnswers>);
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
      await page.getByTestId('current-status').getByRole('button', { name: 'Send' }).click();
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
      await page.getByRole('button', { name: 'Confirm all found values' }).click();
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
      await page.getByRole('button', { name: 'Delete everything' }).click();
      await shot(page, '35-delete', theme, false);
      await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
      await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
      await shot(page, '36-record-deleted', theme, false);
    });
  });
}

for (const width of [320, 1280] as const) {
  for (const lang of ['en', 'es'] as const) {
    test(`${width} px, ${lang}: start, question, results`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 800 });
      await setup(page, context, 'light');
      await page.goto('/');
      if (lang === 'es') {
        await page.getByTestId('language-button').click();
        await page.getByRole('radio', { name: 'Español' }).click();
      }
      await shot(page, `40-${width}-${lang}-start`, 'light', false);
      await page.goto('/#/q/residentStatus');
      await shot(page, `41-${width}-${lang}-question`, 'light', false);
      await page.goto('/');
      if (lang === 'en') await completeQuickCheck(page, { income: { band: '30,000 to 44,999' } } as Partial<FlowAnswers>);
      else {
        // Spanish: answer through the same flow by skipping every question, then open results.
        await page.goto('/#/results');
      }
      await shot(page, `42-${width}-${lang}-results`, 'light', false);
    });
  }
}
