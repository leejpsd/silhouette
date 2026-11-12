// The narrow interface tasks use to talk to a model, so unit tests can replace Firebase AI Logic
// at the ai/ boundary. Production uses createModel() from ./firebase (loaded lazily).
import type { HybridParams } from 'firebase/ai';

export interface UsageMetadata {
  readonly promptTokenCount?: number;
  readonly candidatesTokenCount?: number;
  readonly thoughtsTokenCount?: number;
  readonly totalTokenCount?: number;
}

/** The parts of a grounded or audio response the app reads (shapes from the Firebase AI Logic SDK). */
export interface ResponseCandidate {
  readonly content?: { readonly parts?: readonly { readonly text?: string; readonly inlineData?: { readonly mimeType?: string; readonly data?: string } }[] } | undefined;
  readonly groundingMetadata?:
    | {
        readonly searchEntryPoint?: { readonly renderedContent?: string } | undefined;
        readonly groundingChunks?: readonly {
          readonly web?: { readonly uri?: string; readonly title?: string } | undefined;
          readonly maps?: { readonly uri?: string; readonly title?: string; readonly text?: string; readonly placeId?: string } | undefined;
        }[];
        readonly webSearchQueries?: readonly string[];
        readonly googleMapsWidgetContextToken?: string;
      }
    | undefined;
}

export interface ModelResponse {
  text(): string;
  readonly candidates?: readonly ResponseCandidate[] | undefined;
  readonly usageMetadata?: UsageMetadata | undefined;
  /** Firebase AI Logic reports "on_device" or "in_cloud". */
  readonly inferenceSource?: string | undefined;
}

export interface ModelPort {
  generateContent(
    request: string | readonly (string | { readonly inlineData: { readonly data: string; readonly mimeType: string } })[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly response: ModelResponse;
  }>;
  initializeDeviceModel?(onDownloadProgress?: (progress: number) => void): Promise<void>;
}

export type ModelProvider = (params: HybridParams) => Promise<ModelPort>;

const firebaseProvider: ModelProvider = async (params) => {
  const { createModel } = await import('./firebase');
  return (await createModel(params)) as unknown as ModelPort;
};

let provider: ModelProvider = firebaseProvider;
const instances = new Map<string, Promise<ModelPort>>();

/** One model instance per key (task id plus the options that fix its configuration). */
export function modelFor(key: string, params: () => HybridParams): Promise<ModelPort> {
  let instance = instances.get(key);
  if (!instance) {
    instance = provider(params());
    instances.set(key, instance);
    instance.catch(() => instances.delete(key));
  }
  return instance;
}

/** Test seam: replace the model provider (and drop cached instances). */
export function setModelProviderForTests(next: ModelProvider | null): void {
  provider = next ?? firebaseProvider;
  instances.clear();
}

export type InferenceSource = 'ON_DEVICE' | 'IN_CLOUD';

/** Maps the SDK's "on_device" / "in_cloud" to the names used in routing.json and the UI. */
export function sourceOf(response: ModelResponse, fallback: InferenceSource): InferenceSource {
  const s = response.inferenceSource;
  if (s === 'on_device' || s === 'ON_DEVICE') return 'ON_DEVICE';
  if (s === 'in_cloud' || s === 'IN_CLOUD') return 'IN_CLOUD';
  return fallback;
}

/** Drops cached model instances (after the Firebase app was closed). */
export function resetModelInstances(): void {
  instances.clear();
}

export type DeviceAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelStatic {
  availability(options?: unknown): Promise<string>;
}

/**
 * Chrome's on-device model availability for these createOptions. Status only: inference always goes
 * through Firebase AI Logic.
 */
export async function deviceAvailability(createOptions: unknown): Promise<DeviceAvailability> {
  const lm = (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  if (!lm || typeof lm.availability !== 'function') return 'unavailable';
  try {
    const value = await lm.availability(createOptions);
    return value === 'available' || value === 'downloadable' || value === 'downloading' ? value : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
