// What the paystub changed, as amounts (contract v1.44, results.docEffect.*), on the build people get: the
// judges' household without and with the sample paystub, both worked out by the rules on this device
// (shared/fixtures/conformance/judges-household.json), then the yearly sums.
import { expect, test } from '@playwright/test';
import { cloudRefusesAppCheck, noOnDeviceModel } from '../model-fakes';

test('one press: without and with the paystub side by side, and the yearly amounts the rules found', async ({ page, context }) => {
  await noOnDeviceModel(context);
  // An automated browser does not pass reCAPTCHA: the live cloud half is refused and the recording is shown.
  await cloudRefusesAppCheck(page);
  await page.goto('/#/judges');
  await page.getByTestId('judges-run-all').getByRole('button', { name: 'Run all three steps' }).click();
  await expect(page).toHaveURL(/#\/results/, { timeout: 30_000 });
  const payoff = page.getByTestId('doc-payoff');
  await expect(payoff).toBeVisible();
  await expect(payoff.getByRole('columnheader', { name: 'Without the paystub' })).toBeVisible();
  await expect(payoff.getByRole('columnheader', { name: 'With the paystub' })).toBeVisible();
  await expect(page.getByTestId('doc-compare-may')).toHaveAttribute('data-without', '3');
  await expect(page.getByTestId('doc-compare-may')).toHaveAttribute('data-with', '5');
  await expect(page.getByTestId('doc-compare-may')).toContainText('May qualify');
  await expect(page.getByTestId('doc-compare-amount')).toHaveAttribute('data-without', '0');
  await expect(page.getByTestId('doc-compare-amount')).toHaveAttribute('data-with', '3');
  // Federal EITC 3,573 and YCTC 796; CalEITC only as its published maximum.
  await expect(page.getByTestId('doc-total')).toHaveText('About $4,369 a year, plus up to $2,016');
  await expect(payoff).toContainText('Added up from the programs below that show an amount. Each is decided by the rules on this device.');
  // The lines that were there stay.
  await expect(page.getByTestId('doc-filled')).toBeVisible();
  await expect(page.getByTestId('doc-changes')).toHaveAttribute('data-count', '2');
});
