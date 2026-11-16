// Turns Firebase AI Logic / App Check / network failures into stable kinds the UI can explain.
// The original SDK message is kept in `detail` for the report; it never contains document values
// (requests carry only CloudSafe input).

export type TaskErrorKind =
  | 'app-check' // App Check token missing, invalid or not registered
  | 'permission' // 403 for another reason (API key restrictions, API disabled for the key)
  | 'api-not-enabled'
  | 'quota'
  | 'quota-daily' // the free daily limit: trying again in a minute will not help
  | 'cancelled' // the person cancelled; a late reply is never shown
  | 'blocked' // the reply stated a result twice (shared/prompts/OUTPUT_CHECKS.md)
  | 'network'
  | 'on-device-unavailable'
  | 'bad-output' // the model answered, but not with JSON of the expected shape
  | 'on-device-unreliable' // the on-device answer failed the checks and the person chose to keep everything on the device
  | 'unknown';

export class TaskError extends Error {
  override readonly name = 'TaskError';
  constructor(
    readonly kind: TaskErrorKind,
    readonly detail: string,
    readonly status?: number,
  ) {
    super(`${kind}: ${detail}`);
  }
}

interface ErrorLike {
  readonly name?: unknown;
  readonly code?: unknown;
  readonly message?: unknown;
  readonly customErrorData?: { readonly status?: unknown };
}

export function classifyError(error: unknown): TaskError {
  if (error instanceof TaskError) return error;
  const e = (error ?? {}) as ErrorLike;
  const message = typeof e.message === 'string' ? e.message : String(error);
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.customErrorData?.status === 'number' ? e.customErrorData.status : undefined;
  const lower = message.toLowerCase();
  if (lower.includes('app check') || lower.includes('appcheck') || lower.includes('app-check')) {
    return new TaskError('app-check', message, status);
  }
  if (code.endsWith('unsupported') || lower.includes('on-device model is not available') || lower.includes('local languagemodel api not available')) {
    return new TaskError('on-device-unavailable', message, status);
  }
  if (code.endsWith('api-not-enabled')) return new TaskError('api-not-enabled', message, status);
  if (status === 401) return new TaskError('app-check', message, status);
  if (status === 403) return new TaskError('permission', message, status);
  if (status === 429 || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return new TaskError(/per.?day|daily/i.test(message) ? 'quota-daily' : 'quota', message, status);
  }
  if (e.name === 'AbortError' && lower.includes('abort')) return new TaskError('cancelled', message, status);
  if (code.endsWith('fetch-error') || e.name === 'TypeError' || lower.includes('failed to fetch') || lower.includes('network')) {
    return new TaskError('network', message, status);
  }
  if (code.endsWith('parse-failed')) return new TaskError('bad-output', message, status);
  return new TaskError('unknown', message, status);
}
