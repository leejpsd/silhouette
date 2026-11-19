import { afterEach, describe, expect, it, vi } from 'vitest';
import { appCheckCause, TaskError } from './errors';

describe('why App Check could not get a token', () => {
  afterEach(() => vi.unstubAllGlobals());
  const live = 'AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent: AppCheck: 403 error. Attempts allowed again after 01d:00m:00s (appCheck/initial-throttle). (AI/error)';

  it('a browser controlled by automation software is named as such, whatever the error', () => {
    vi.stubGlobal('navigator', { webdriver: true });
    expect(appCheckCause(new TaskError('app-check', live))).toBe('automation');
  });
  it('a 403 from the token exchange, or the SDK waiting after one, is a visit reCAPTCHA did not accept', () => {
    vi.stubGlobal('navigator', { webdriver: false });
    expect(appCheckCause(new TaskError('app-check', live))).toBe('refused');
    expect(appCheckCause(new TaskError('app-check', 'AppCheck: Requests throttled due to previous 403 error.'))).toBe('refused');
  });
  it('anything else is a check the app could not reach', () => {
    vi.stubGlobal('navigator', { webdriver: false });
    expect(appCheckCause(new TaskError('app-check', 'AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).'))).toBe('unreachable');
  });
});
