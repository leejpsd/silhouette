// ONLY_ON_DEVICE tasks. This is the only file under src/ai/ that may unwrap Raw values, and the
// routing check (scripts/check-routing.mjs) rejects any other inference mode in this file, so Raw
// input can only ever reach Chrome's on-device model through Firebase AI Logic.

import { InferenceMode } from 'firebase/ai';
import { Raw, reveal } from '../core/types';
import routing from '../../../shared/routing.json';
import { classifyError, TaskError } from './errors';
import { modelFor, sourceOf } from './model-port';
import { PHOTO_CREATE_OPTIONS } from './device-model';
import { PHOTO_READ, fill } from './prompts';
import type { DocType, RoutingReason, TaskResult } from './tasks';

const PHOTO_TASK = routing.tasks['document.photo.read'];
const PHOTO_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png']);

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Task `document.photo.read`: ONLY_ON_DEVICE, input Raw (photo), reason `photo-never-leaves`.
 * Transcribes the photo on device; the text stays Raw and goes through the Skeletonizer next.
 * Throws TaskError('on-device-unavailable') when the on-device model cannot run.
 */
export async function readPhoto(photo: Raw<Blob>, docType: DocType, language: string): Promise<TaskResult<Raw<string>>> {
  if (PHOTO_TASK.mode !== 'ONLY_ON_DEVICE') throw new Error('routing.json changed: document.photo.read mode');
  const image = reveal(photo);
  if (!PHOTO_TYPES.has(image.type)) throw new TaskError('on-device-unavailable', 'only JPEG and PNG photos can be read on device');
  try {
    const model = await modelFor(`document.photo.read:${language}`, () => ({
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: { ...PHOTO_CREATE_OPTIONS(language), initialPrompts: [{ role: 'system', content: PHOTO_READ.system }] } as never,
      },
    }));
    const { response } = await model.generateContent([
      fill(PHOTO_READ.user, { docType }),
      { inlineData: { data: await base64(image), mimeType: image.type } },
    ]);
    const source = sourceOf(response, 'ON_DEVICE');
    if (source !== 'ON_DEVICE') throw new TaskError('on-device-unavailable', 'photo task did not run on device');
    return { value: Raw.of(response.text()), inferenceSource: source, reason: PHOTO_TASK.reason as RoutingReason };
  } catch (error) {
    throw classifyError(error);
  }
}
