import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeQuickCheck, confirmAllValues, openDeleteEverything } from './helpers';
import { fakeAnswerModels, fakeCloudModel, fixturePointers, noOnDeviceModel, seedRemoteConfig } from './model-fakes';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Judged on the settled screen: one-off animations (a bar wiping in) have finished, and the page is
 * scrolled to its end, where the bottom block sits after the content instead of over it (mid-scroll the
 * sticky block covers whatever passes under it, by design).
 */
const settle = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
};

for (const colorScheme of ['light', 'dark'] as const) {
  test(`axe finds no WCAG A/AA violations on every Quick Check screen (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const scan = async (label: string) => {
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.help} ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`)).toEqual([]);
    };
    await page.goto('/');
    await scan('start');
    await page.getByRole('button', { name: 'Details' }).click();
    await scan('start, leaving panel open');
    await page.getByRole('button', { name: 'Hide details' }).click();
    await page.getByRole('button', { name: 'Start Quick Check' }).click();
    await scan('question (int)');
    await page.getByRole('button', { name: 'Next' }).click();
    await scan('question with error');
    await page.goto('/#/q/income');
    await page.getByLabel('I know the exact amount').check();
    await scan('question (income, exact)');
    await page.goto('/#/q/residentStatus');
    await scan('question (sensitive)');
    await page.goto('/#/q/benefits');
    await page.getByRole('checkbox').first().check();
    await scan('question (multi)');
    // Nothing was submitted above, so the start screen offers a fresh Quick Check.
    await page.goto('/');
    await completeQuickCheck(page, { householdSize: '2', numChildren: '1', income: { band: '$30,000 to $44,999' }, housing: 'I own', resident: 'skip' });
    await scan('results');
    await page.getByTestId('program-food-help').getByRole('link').click();
    await scan('verdict card');
    await openDeleteEverything(page);
    await scan('delete dialog');
  });
}


for (const colorScheme of ['light', 'dark'] as const) {
  test(`axe finds no WCAG A/AA violations on the document screens (${colorScheme})`, async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.emulateMedia({ colorScheme });
    const scan = async (label: string) => {
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.help} ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`)).toEqual([]);
    };
    await page.goto('/#/doc');
    await page.getByTestId('model-status').waitFor();
    await scan('add a document');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByTestId('skeleton-preview').waitFor();
    await scan('skeleton preview');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByTestId('inference-badge').waitFor();
    await scan('review');
    await page.getByRole('button', { name: 'Change: Gross pay this period' }).click();
    await scan('review, editing a field');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    await page.getByTestId('validation').waitFor();
    await scan('review, checks and yearly income');
    await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
    await page.getByText('Show exactly what was sent').click();
    await scan('leaving panel with payload');
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`axe finds no WCAG A/AA violations on explanations and more help (${colorScheme})`, async ({ page, context }) => {
    const flags = { feature_grounding_search: 'true', feature_grounding_maps: 'true', feature_tts: 'true' };
    await noOnDeviceModel(context);
    await seedRemoteConfig(context, flags);
    await fakeAnswerModels(page, {}, flags);
    await page.emulateMedia({ colorScheme });
    const scan = async (label: string) => {
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.help} ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`)).toEqual([]);
    };
    await page.goto('/');
    await completeQuickCheck(page);
    await page.goto('/#/program/utility-discount');
    await page.getByRole('button', { name: 'Explain this program' }).click();
    await page.getByText('Show the exact request').click();
    await scan('leaving your device, before Send');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByTestId('explain-short').getByTestId('answer').waitFor();
    await page.getByRole('button', { name: 'How do I apply?' }).click();
    await page.getByTestId('chip-apply').getByTestId('answer').waitFor();
    await page.getByRole('button', { name: /Check current information/ }).click();
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByTestId('search-suggestions').waitFor();
    await scan('program with answers and current information');
    await page.goto('/#/discover');
    await page.getByRole('button', { name: 'Look for other help' }).click();
    // Other help is given the silhouette (not the program's public information): its own step first.
    await page.getByTestId('send-decision').getByRole('button', { name: 'Send' }).click();
    await page.getByTestId('leads').waitFor();
    await scan('leads');
    await page.goto('/#/nearby');
    await page.getByLabel('Your county').selectOption('testshire');
    await page.getByRole('button', { name: 'Find help near the county center' }).click();
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByTestId('places').waitFor();
    await scan('places');
  });
}
