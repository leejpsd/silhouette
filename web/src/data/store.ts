// Local encrypted store: IndexedDB + WebCrypto AES-GCM.
// - One 256-bit AES-GCM key per device, generated with extractable = false and kept in
//   IndexedDB as a CryptoKey object: script can use it but never read its bytes.
// - Each record is encrypted with a fresh 96-bit IV; the record id is bound as additional data.
// - deleteEverything() deletes the whole database (key included) and the app's web storage.
// Values are plain JSON here; they are not CloudSafe, so they cannot reach a cloud-capable call.

const DB_NAME = 'silhouette';
const DB_VERSION = 1;
const KEYS = 'keys';
const RECORDS = 'records';
const KEY_ID = 'device-key';

/** localStorage keys owned by the app (non-sensitive preferences only). */
export const PREF_PREFIX = 'silhouette.';

interface EncryptedRecord {
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly data: ArrayBuffer;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS);
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Could not open IndexedDB'));
    };
  });
  return dbPromise;
}

async function deviceKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await request<unknown>(db.transaction(KEYS).objectStore(KEYS).get(KEY_ID));
  if (existing instanceof CryptoKey) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const tx = db.transaction(KEYS, 'readwrite');
  // `add` fails if another tab created a key first; then use theirs.
  try {
    await request(tx.objectStore(KEYS).add(key, KEY_ID));
    return key;
  } catch {
    const winner = await request<unknown>(db.transaction(KEYS).objectStore(KEYS).get(KEY_ID));
    if (winner instanceof CryptoKey) return winner;
    throw new Error('Could not create the device key');
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function saveRecord(id: string, value: unknown): Promise<void> {
  const db = await openDb();
  const key = await deviceKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(id) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  const record: EncryptedRecord = { iv, data };
  await request(db.transaction(RECORDS, 'readwrite').objectStore(RECORDS).put(record, id));
}

/** Returns the decrypted value, or undefined when there is no record (or it cannot be decrypted). */
export async function loadRecord(id: string): Promise<unknown> {
  const db = await openDb();
  const record = await request<EncryptedRecord | undefined>(db.transaction(RECORDS).objectStore(RECORDS).get(id));
  if (!record) return undefined;
  const key = await deviceKey(db);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv, additionalData: encoder.encode(id) },
      key,
      record.data,
    );
    return JSON.parse(decoder.decode(plain)) as unknown;
  } catch {
    return undefined;
  }
}

/** IndexedDB databases the Firebase SDK may create on this origin (deleted even if not listed). */
export const FIREBASE_DATABASES: readonly string[] = [
  'firebase-heartbeat-database',
  'firebase-app-check-database',
  'firebase-installations-database',
  'firebaseLocalStorageDb',
];

// Every IndexedDB connection opened on this origin (ours and the Firebase SDK's). The SDK keeps
// some connections in module-level caches that deleteApp() does not close; an open connection
// blocks deletion, so "Delete everything" closes them all first.
const openConnections = new Set<IDBDatabase>();
let tracking = false;

/** Call once at start-up, before Firebase loads. */
export function trackDatabaseConnections(factory: IDBFactory = indexedDB): void {
  if (tracking) return;
  tracking = true;
  const original = factory.open.bind(factory);
  factory.open = (name: string, version?: number) => {
    const request = version === undefined ? original(name) : original(name, version);
    request.addEventListener('success', () => {
      const db = request.result;
      openConnections.add(db);
      db.addEventListener('close', () => openConnections.delete(db));
    });
    return request;
  };
}

function closeTrackedConnections(): void {
  for (const db of openConnections) {
    try {
      db.close();
    } catch {
      // Already closed.
    }
  }
  openConnections.clear();
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Could not delete a database'));
    req.onblocked = () => resolve(); // Completes once other tabs close their connection.
  });
}

export interface DeleteReport {
  /** Names of the IndexedDB databases that existed on this origin and were deleted. */
  readonly databases: readonly string[];
  /** Number of localStorage and sessionStorage entries removed. */
  readonly storageEntries: number;
}

/**
 * Deletes everything this app (and the Firebase SDK it uses) stored on this origin:
 * every IndexedDB database (the encrypted store with its key, and the SDK's App Check, heartbeat
 * and installation databases), and the app's and the SDK's localStorage and sessionStorage
 * entries. The service worker's cache of the app's own files is kept; it holds no user data.
 * Close the Firebase app first (shutdownFirebase), or its open connections delay the deletion.
 */
export async function deleteEverything(): Promise<DeleteReport> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      // The database never opened; nothing to close.
    }
    dbPromise = null;
  }
  closeTrackedConnections();
  let existing: string[] | null = null;
  try {
    existing = (await indexedDB.databases()).map((d) => d.name).filter((n): n is string => typeof n === 'string');
  } catch {
    existing = null; // databases() is not available everywhere; fall back to the known names.
  }
  const names = new Set([DB_NAME, ...FIREBASE_DATABASES, ...(existing ?? [])]);
  for (const name of names) await deleteDatabase(name);
  let storageEntries = 0;
  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    if (!storage) continue;
    for (const key of Object.keys(storage)) {
      if (key.startsWith(PREF_PREFIX) || key.toLowerCase().startsWith('firebase')) {
        storage.removeItem(key);
        storageEntries++;
      }
    }
  }
  return { databases: existing ?? [...names], storageEntries };
}

export const STORE_NAMES = { database: DB_NAME, keys: KEYS, records: RECORDS } as const;
