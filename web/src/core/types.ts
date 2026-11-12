// Data types and the routing rule (shared/DATA_TYPES.md).
//
// - Raw<T>          exact personal values. Opaque: no serialization, logging or toString reveals the value.
// - Skeleton        a document silhouette (shared/skeleton/SPEC.md). Produced only by skeletonize().
// - Generalized<T>  the profile silhouette (rulepacks/SPEC.md section 6). Produced only by generalize().
// - Public<T>       static public content shipped with the app (program names, rule text, jurisdiction).
// - CloudSafe       Skeleton | Generalized | Public: the only input a cloud-capable call accepts.
//
// The brands below exist only in the type system (phantom properties). A value can become
// Skeleton or Generalized only through skeletonize() / generalize() (they use the private
// constructors in this module), so a Raw value, or a plain value revealed from a Raw, never
// type-checks as CloudSafe.

declare const skeletonBrand: unique symbol;
declare const generalizedBrand: unique symbol;
declare const publicBrand: unique symbol;

/** A document silhouette: every number, date and non-allowlisted word replaced by a placeholder. */
export type Skeleton = string & { readonly [skeletonBrand]: true };

/** A generalized (banded) description of the user. */
export type Generalized<T> = T & { readonly [generalizedBrand]: true };

/** Public, static content (rule packs, program names, copy). */
export type Public<T> = T & { readonly [publicBrand]: true };

/** The only values that may enter a PREFER_ON_DEVICE, PREFER_IN_CLOUD or ONLY_IN_CLOUD call. */
export type CloudSafe = Skeleton | Generalized<unknown> | Public<unknown>;

// ---------- Raw ----------

const REDACTED = '[Raw]';

let revealImpl: <T>(raw: Raw<T>) => T;

/**
 * An exact personal value. Opaque by construction:
 * - the value lives in an ECMAScript private field, so JSON.stringify, Object.keys, spread,
 *   structuredClone and util.inspect do not see it;
 * - toJSON, toString and the Node inspect hook return a fixed redaction marker.
 *
 * Only deterministic code (validation, verdicts, generalize, skeletonize, rehydrate, UI that
 * shows the user their own values) may call reveal(). Code under src/ai/ must never call it.
 */
export class Raw<T> {
  readonly #value: T;

  private constructor(value: T) {
    this.#value = value;
  }

  static of<T>(value: T): Raw<T> {
    return new Raw(value);
  }

  static {
    revealImpl = <V>(raw: Raw<V>): V => raw.#value;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}

/** Returns the value inside a Raw. Deterministic, on-device code only. */
export function reveal<T>(raw: Raw<T>): T {
  return revealImpl(raw);
}

/** Applies a deterministic transformation without unwrapping the result. */
export function mapRaw<T, U>(raw: Raw<T>, fn: (value: T) => U): Raw<U> {
  return Raw.of(fn(revealImpl(raw)));
}

// ---------- Cloud-safe constructors (module-private by convention) ----------

/** JSON data that contains no Raw (a Raw is a class instance, so it is not assignable here). */
export type PublicData =
  | string
  | number
  | boolean
  | null
  | readonly PublicData[]
  | { readonly [key: string]: PublicData };

/**
 * Marks static content shipped with the app (rule pack text, program names, jurisdiction ids,
 * prepared question chips) as Public. Never use it on a value that came from reveal().
 */
export function asPublic<const T extends PublicData>(value: T): Public<T> {
  return value as Public<T>;
}

/** @internal Used only by skeletonize() in skeleton.ts. */
export function brandSkeleton(value: string): Skeleton {
  return value as Skeleton;
}

/** @internal Used only by generalize() / canonical() in generalize.ts. */
export function brandGeneralized<const T extends PublicData>(value: T): Generalized<T> {
  return value as Generalized<T>;
}

// ---------- JSON ----------

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
