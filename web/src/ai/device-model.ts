// On-device model status for the UI (unavailable / downloadable / downloading / available).
// `LanguageModel.availability()` is used only to show status; downloads go through
// Firebase AI Logic's initializeDeviceModel() and must start from a user gesture.

import { pointerModel, pointerModelParams, type DocType } from './tasks';

export type DeviceStatus = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelStatic {
  availability(options?: unknown): Promise<string>;
}

function languageModel(): LanguageModelStatic | null {
  const lm = (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  return lm && typeof lm.availability === 'function' ? lm : null;
}

const asStatus = (value: string): DeviceStatus =>
  value === 'available' || value === 'downloadable' || value === 'downloading' ? value : 'unavailable';

/** Availability for exactly the options the pointer model is created with (built-in-ai skill rule). */
export async function pointerDeviceStatus(docType: DocType, language: string): Promise<DeviceStatus> {
  const lm = languageModel();
  if (!lm) return 'unavailable';
  try {
    return asStatus(await lm.availability(pointerModelParams(docType, language).onDeviceParams?.createOptions));
  } catch {
    return 'unavailable';
  }
}

/** Availability for image + text input (the photo task). */
export async function photoDeviceStatus(language: string): Promise<DeviceStatus> {
  const lm = languageModel();
  if (!lm) return 'unavailable';
  try {
    return asStatus(await lm.availability(PHOTO_CREATE_OPTIONS(language)));
  } catch {
    return 'unavailable';
  }
}

export const PHOTO_CREATE_OPTIONS = (language: string) => ({
  expectedInputs: [{ type: 'image' }, { type: 'text', languages: [language] }],
  expectedOutputs: [{ type: 'text', languages: [language] }],
});

/** createOptions of the typed-question model (ask.freeText). */
export const ASK_CREATE_OPTIONS = (locale: string) => ({
  expectedInputs: [{ type: 'text', languages: ['en', locale] }],
  expectedOutputs: [{ type: 'text', languages: [locale] }],
});

/** Whether a typed question can be answered on this device in this language. */
export async function askDeviceStatus(locale: string): Promise<DeviceStatus> {
  const lm = languageModel();
  if (!lm) return 'unavailable';
  try {
    return asStatus(await lm.availability(ASK_CREATE_OPTIONS(locale)));
  } catch {
    return 'unavailable';
  }
}

/** Starts (or joins) the on-device model download. Call only from a user gesture. */
export async function downloadDeviceModel(docType: DocType, language: string, onProgress: (fraction: number) => void): Promise<void> {
  const model = await pointerModel(docType, language);
  if (!model.initializeDeviceModel) throw new Error('This model cannot be initialized on device');
  await model.initializeDeviceModel(onProgress);
}
