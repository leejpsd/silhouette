// Prompts are loaded from ../shared/prompts at build time (never pasted here). Tasks that have no
// shared prompt yet use the files in ./prompts/, in the same format.
import pointerExtractV2 from '../../../shared/prompts/pointer-extract.v2.md?raw';
import pointerExtractV3 from '../../../shared/prompts/pointer-extract.v3.md?raw';
import explainV1 from '../../../shared/prompts/explain.v1.md?raw';
import askV1 from './prompts/ask.v1.md?raw';
import currentStatusV1 from './prompts/current-status.v1.md?raw';
import discoverV1 from './prompts/discover.v1.md?raw';
import nearbyV1 from './prompts/nearby.v1.md?raw';
import readAloudV1 from './prompts/read-aloud.v1.md?raw';
import photoReadV1 from '../../../shared/prompts/photo-read.v1.md?raw';

export interface PromptTemplate {
  readonly id: string;
  readonly system: string;
  readonly user: string;
}

/** Splits a prompt file into its "System instruction" text and the fenced "User content" template. */
export function parsePrompt(id: string, markdown: string): PromptTemplate {
  const section = (title: string): string => {
    const start = markdown.indexOf(`## ${title}`);
    if (start === -1) throw new Error(`${id}: missing section "${title}"`);
    const body = markdown.slice(start + title.length + 3);
    const end = body.search(/\n## /);
    return (end === -1 ? body : body.slice(0, end)).trim();
  };
  const user = /```\n([\s\S]*?)\n```/.exec(section('User content'))?.[1];
  if (user === undefined) throw new Error(`${id}: "User content" has no fenced template`);
  return { id, system: section('System instruction'), user };
}

export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

export const POINTER_EXTRACT = parsePrompt('pointer-extract.v2', pointerExtractV2);
export const POINTER_EXTRACT_V3 = parsePrompt('pointer-extract.v3', pointerExtractV3);
export const EXPLAIN_V1 = parsePrompt('explain.v1', explainV1);
export const PHOTO_READ = parsePrompt('photo-read.v1', photoReadV1);
export const ASK_V1 = parsePrompt('ask.v1', askV1);
export const CURRENT_STATUS_V1 = parsePrompt('current-status.v1', currentStatusV1);
export const DISCOVER_V1 = parsePrompt('discover.v1', discoverV1);
export const NEARBY_V1 = parsePrompt('nearby.v1', nearbyV1);
export const READ_ALOUD_V1 = parsePrompt('read-aloud.v1', readAloudV1);

/** Bundled explain prompts by version (Remote Config prompt_explain_v); unknown → the newest. */
const EXPLAIN_PROMPTS: ReadonlyMap<number, PromptTemplate> = new Map([[1, EXPLAIN_V1]]);

export function explainPromptFor(version: number): PromptTemplate {
  return EXPLAIN_PROMPTS.get(version) ?? (EXPLAIN_PROMPTS.get(Math.max(...EXPLAIN_PROMPTS.keys())) as PromptTemplate);
}
