// "Where each task runs" lists every task of the routing table under a name, in English and Spanish.
import { describe, expect, it } from 'vitest';
import routing from '../../../shared/routing.json';
import { lookup } from './i18n';

describe('where each task runs', () => {
  it('every task in shared/routing.json has a name in en and es', () => {
    for (const id of Object.keys(routing.tasks)) {
      expect(lookup('en', `tasks.task.${id}`), id).toBeTruthy();
      expect(lookup('es', `tasks.task.${id}`), id).not.toBe(lookup('en', `tasks.task.${id}`));
    }
  });

  it('every mode of the table falls in one of the four cards', () => {
    const modes = new Set(Object.values(routing.tasks).map((t) => t.mode));
    for (const mode of modes) expect(['ONLY_ON_DEVICE', 'PREFER_ON_DEVICE', 'PREFER_IN_CLOUD', 'ONLY_IN_CLOUD', 'NONE']).toContain(mode);
  });
});
