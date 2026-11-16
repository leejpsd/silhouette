// Test helper: a stand-in for Chrome's `LanguageModel` global, so the ONLY_ON_DEVICE guard sees the
// availability a test wants. Inference itself is faked at the model-port boundary.
export type FakeAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'absent';

export function setDeviceModelForTests(availability: FakeAvailability): void {
  const g = globalThis as { LanguageModel?: unknown };
  if (availability === 'absent') delete g.LanguageModel;
  else g.LanguageModel = { availability: async () => availability };
}
