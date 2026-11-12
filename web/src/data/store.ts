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

/** Deletes the database (records and key) and the app's localStorage/sessionStorage entries. */
export async function deleteEverything(): Promise<void> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      // The database never opened; nothing to close.
    }
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Could not delete the database'));
    req.onblocked = () => resolve(); // Deletion completes once other tabs close their connection.
  });
  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    if (!storage) continue;
    for (const key of Object.keys(storage)) if (key.startsWith(PREF_PREFIX)) storage.removeItem(key);
  }
}

export const STORE_NAMES = { database: DB_NAME, keys: KEYS, records: RECORDS } as const;
