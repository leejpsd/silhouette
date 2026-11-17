// Copy this app needs that shared/copy does not have yet. Looked up after shared/copy and the pack
// copy, so once shared/copy has a key, its text is used and the entry here can be removed.
// Empty since contract v1.18: every key the app uses is in shared/copy.

export const LOCAL_COPY: Readonly<Record<'en' | 'es' | 'ko', Readonly<Record<string, string>>>> = {
  en: {},
  es: {},
  ko: {},
};
