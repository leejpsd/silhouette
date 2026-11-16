// The build people get: the California draft pack. The notice on every screen, the official sources
// with their read date, the judges' path from a prepared household to a sharper result after the
// sample paystub, money as the pack writes it, layouts at phone, tablet and laptop widths, and axe.
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { chooseLanguage, confirmAllValues } from '../helpers';
import { fakeCloudModel, fixturePointers, noOnDeviceModel } from '../model-fakes';

const pack = JSON.parse(readFileSync(new URL('../../../shared/rulepacks/us-ca/pack.json', import.meta.url), 'utf8')) as { programs: { id: string; sources: { url: string }[] }[] };
const copyEn = JSON.parse(readFileSync(new URL('../../../shared/rulepacks/us-ca/copy/en.json', import.meta.url), 'utf8')) as Record<string, string>;
const name = (id: string) => copyEn[`program.${id}.name`] as string;

async function prepared(page: Page) {
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Fill in and see the results' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
}

const verdictOf = (page: Page, id: string) => page.getByTestId(`program-${id}`);

test.describe('the California draft pack', () => {
  test('every screen says these are real programs read from official sources on a date, as a draft', async ({ page }) => {
    await page.goto('/');
    const notice = page.getByTestId('demo-banner');
    await expect(notice).toHaveAttribute('data-pack', 'draft');
    await expect(notice).toContainText('Draft rules, read November 12, 2026.');
    await expect(page.getByText('Demo rules')).toHaveCount(0);
    await notice.getByRole('button', { name: 'More' }).click();
    await expect(page.getByTestId('draft-body')).toContainText('These are real California and federal programs');
    await expect(page.getByTestId('draft-body')).toContainText('“may qualify”');
    await page.keyboard.press('Escape');
    for (const path of ['/#/q/householdSize', '/#/results', '/#/doc', '/#/judges']) {
      await page.goto(path);
      await expect(page.getByTestId('demo-banner')).toContainText('Draft rules, read November 12, 2026.');
    }
  });

  test('every program page links its official sources with the date they were read', async ({ page }) => {
    await prepared(page);
    for (const program of pack.programs) {
      await page.goto(`/#/program/${program.id}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name(program.id));
      const sources = page.getByTestId('official-sources');
      await expect(sources.getByRole('link')).toHaveCount(program.sources.length);
      for (const s of program.sources) await expect(sources.locator(`a[href="${s.url}"]`)).toBeVisible();
      await expect(sources.getByTestId('source-read-on').first()).toHaveText('Read from this source on November 12, 2026');
      await expect(page.getByTestId('rules-status')).toContainText('Draft rules: read from official sources on November 12, 2026');
      await expect(page.getByTestId('rules-status')).not.toContainText('for testing');
    }
  });

  test('the judges\' path: every kind of result, and the sample paystub sharpens two of them', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await prepared(page);
    await expect(verdictOf(page, 'federal-eitc')).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'caleitc')).toHaveAttribute('data-verdict', 'maybe');
    await expect(verdictOf(page, 'yctc')).toHaveAttribute('data-verdict', 'maybe');
    await expect(verdictOf(page, 'calfresh')).toHaveAttribute('data-verdict', 'depends');
    await expect(verdictOf(page, 'fera')).toHaveAttribute('data-verdict', 'unlikely');

    await page.goto('/#/judges');
    await page.getByRole('button', { name: 'Open the sample paystub' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByTestId('annual-income')).toHaveText('$29,233');
    await page.getByRole('button', { name: 'Use $29,233 as my yearly income' }).click();
    await expect(verdictOf(page, 'caleitc')).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'yctc')).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'yctc')).toContainText('$796');
    await expect(verdictOf(page, 'federal-eitc')).toContainText('$3,573');
  });

  test('money is written as the pack says, in Spanish too', async ({ page }) => {
    await prepared(page);
    await chooseLanguage(page, 'es');
    await page.goto('/#/program/caleitc');
    await expect(page.getByTestId('why-section')).toContainText('$32,900');
    await expect(page.getByTestId('demo-banner')).toContainText('Reglas en borrador, leídas el 12 de noviembre de 2026.');
    await page.goto('/#/q/income');
    await expect(page.getByRole('radio').first()).toHaveAccessibleName(/\$15,000/);
  });

  for (const width of [390, 768, 1280]) {
    for (const lang of ['en', 'es'] as const) {
      test(`no page scrolls sideways and no program name is cut, ${width} px, ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await prepared(page);
        if (lang === 'es') await chooseLanguage(page, 'es');
        const paths = ['/#/', '/#/results', ...pack.programs.map((p) => `/#/program/${p.id}`), '/#/q/benefits', '/#/q/filingStatus', '/#/q/energyProvider', '/#/judges'];
        for (const path of paths) {
          await page.goto(path);
          await page.getByRole('heading', { level: 1 }).waitFor();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, path).toBeLessThanOrEqual(0);
          // Display text that steps down to fit never overflows its box.
          const clipped = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('h1, .program-name, .featured-name, .option-word, .tile-word, .range-label')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
          );
          expect(clipped, path).toEqual([]);
        }
      });
    }
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`axe finds no WCAG A/AA violations on the shipped pack's screens (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await prepared(page);
      for (const path of ['/#/', '/#/results', '/#/program/caleitc', '/#/program/calfresh', '/#/q/benefits', '/#/judges']) {
        await page.goto(path);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        expect(violations.map((v) => `${path}: ${v.id} ${v.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`)).toEqual([]);
      }
    });
  }
});
