// Page script for the guard check: the app's own ONLY_ON_DEVICE functions with canary input, called
// directly in a real browser page with the network monitor installed, as in the app.
import { Raw } from '../../src/core/types';
import { installNetMonitor } from '../../src/data/net-monitor';
import { askFreeText, explainPersonal, readPhoto, type PersonalResult } from '../../src/ai/on-device';
import canary from '../../../shared/fixtures/canary/paystub-canary-01.json';

installNetMonitor();

type Availability = 'absent' | 'unavailable' | 'downloadable' | 'downloading';

async function run(availability: Availability): Promise<string[]> {
  const g = globalThis as { LanguageModel?: unknown };
  if (availability === 'absent') delete g.LanguageModel;
  else g.LanguageModel = { availability: async () => availability, create: async () => ({ prompt: async () => 'x' }) };
  const secret = canary.canaries.join(' ');
  const result: PersonalResult = { locale: 'en', programName: 'Test', facts: secret, verdictLabel: 'x', verdict: 'unlikely', criteriaLines: secret };
  const outcomes: string[] = [];
  for (const call of [
    () => readPhoto(Raw.of<Blob>(new Blob([secret], { type: 'image/png' })), 'paystub', 'en'),
    () => explainPersonal(Raw.of(result)),
    () => askFreeText(Raw.of(secret), Raw.of(result)),
  ]) {
    try {
      await call();
      outcomes.push('ran');
    } catch (error) {
      outcomes.push((error as { kind?: string }).kind ?? 'error');
    }
  }
  return outcomes;
}

(window as unknown as { runGuard: typeof run }).runGuard = run;
document.body.dataset['ready'] = 'true';
