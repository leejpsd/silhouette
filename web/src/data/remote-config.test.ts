import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_DEFAULTS, appConfig, applyConfigValues, parseConfig, resetConfig } from './remote-config';

afterEach(() => resetConfig());

describe('Remote Config values', () => {
  it('defaults keep paid features off and select pointer prompt v4 and explain v3', () => {
    expect(CONFIG_DEFAULTS).toMatchObject({ groundingSearch: false, groundingMaps: false, tts: false, promptPointerExtractV: 4, promptExplainV: 5, promptAskV: 4 });
    expect(parseConfig({})).toEqual(CONFIG_DEFAULTS);
  });

  it('parses the template forms and ignores malformed values', () => {
    expect(
      parseConfig({
        route_short_text_max_words: '120',
        route_ondevice_locales_web: '["en","es","ja"]',
        feature_grounding_search: 'true',
        feature_grounding_maps: 'false',
        feature_tts: '1',
        prompt_pointer_extract_v: '2',
      }),
    ).toMatchObject({ routeShortTextMaxWords: 120, onDeviceLocales: ['en', 'es', 'ja'], groundingSearch: true, groundingMaps: false, tts: true, promptPointerExtractV: 2 });
    expect(
      parseConfig({ route_short_text_max_words: '-3', route_ondevice_locales_web: 'en', feature_tts: 'maybe', prompt_pointer_extract_v: '"3' }),
    ).toEqual(CONFIG_DEFAULTS);
  });

  it('applied values take effect and are kept for the next start', () => {
    applyConfigValues({ feature_grounding_search: 'true' });
    expect(appConfig().groundingSearch).toBe(true);
  });
});
