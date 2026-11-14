// Prompts are loaded from ../shared/prompts at build time (never pasted here).
import pointerExtractV2 from '../../../shared/prompts/pointer-extract.v2.md?raw';
import pointerExtractV3 from '../../../shared/prompts/pointer-extract.v3.md?raw';
import pointerExtractV4 from '../../../shared/prompts/pointer-extract.v4.md?raw';
import explainV5 from '../../../shared/prompts/explain.v5.md?raw';
import askV4 from '../../../shared/prompts/ask.v4.md?raw';
import explainPersonalV1 from '../../../shared/prompts/explain-personal.v1.md?raw';
import askPersonalV1 from '../../../shared/prompts/ask-personal.v1.md?raw';
import currentStatusV1 from '../../../shared/prompts/current-status.v1.md?raw';
import discoverV1 from '../../../shared/prompts/discover.v1.md?raw';
import nearbyV1 from '../../../shared/prompts/nearby.v1.md?raw';
import readAloudV1 from '../../../shared/prompts/read-aloud.v1.md?raw';
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
export const POINTER_EXTRACT_V4 = parsePrompt('pointer-extract.v4', pointerExtractV4);
export const PHOTO_READ = parsePrompt('photo-read.v1', photoReadV1);
/** General explanation and prepared questions: the program's public information only, nothing about the person. */
export const EXPLAIN_V5 = parsePrompt('explain.v5', explainV5);
export const ASK_V4 = parsePrompt('ask.v4', askV4);
/** The person's own result: on the device only. */
export const EXPLAIN_PERSONAL_V1 = parsePrompt('explain-personal.v1', explainPersonalV1);
export const ASK_PERSONAL_V1 = parsePrompt('ask-personal.v1', askPersonalV1);
export const CURRENT_STATUS_V1 = parsePrompt('current-status.v1', currentStatusV1);
export const DISCOVER_V1 = parsePrompt('discover.v1', discoverV1);
export const NEARBY_V1 = parsePrompt('nearby.v1', nearbyV1);
export const READ_ALOUD_V1 = parsePrompt('read-aloud.v1', readAloudV1);

/**
 * Bundled general-explanation and prepared-question prompts by version (Remote Config
 * prompt_explain_v, prompt_ask_v); an unknown version gets the newest. Only versions that send nothing
 * about the person are bundled (explain 5, ask 4).
 */
const EXPLAIN_PROMPTS: ReadonlyMap<number, PromptTemplate> = new Map([[5, EXPLAIN_V5]]);
const ASK_PROMPTS: ReadonlyMap<number, PromptTemplate> = new Map([[4, ASK_V4]]);

const newest = (prompts: ReadonlyMap<number, PromptTemplate>, version: number): PromptTemplate =>
  prompts.get(version) ?? (prompts.get(Math.max(...prompts.keys())) as PromptTemplate);

export const explainPromptFor = (version: number): PromptTemplate => newest(EXPLAIN_PROMPTS, version);
export const askPromptFor = (version: number): PromptTemplate => newest(ASK_PROMPTS, version);
