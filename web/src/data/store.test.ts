// Encrypted store, run against fake-indexeddb and Node's WebCrypto.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import { STORE_NAMES, deleteEverything, loadRecord, saveRecord } from './store';

const SECRET = { householdSize: 3, income: { kind: 'exact', amount: 30524 }, note: 'Zyxwanda' };

function rawDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORE_NAMES.database);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

afterEach(async () => {
  await deleteEverything();
});

describe('encrypted store', () => {
  it('round-trips a value', async () => {
    await saveRecord('answers', SECRET);
    expect(await loadRecord('answers')).toEqual(SECRET);
  });

  it('stores only ciphertext, never the plaintext', async () => {
    await saveRecord('answers', SECRET);
    const db = await rawDb();
    const records = (await readAll(db, STORE_NAMES.records)) as { iv: Uint8Array; data: ArrayBuffer }[];
    db.close();
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.iv).toHaveLength(12);
    const bytes = new TextDecoder('latin1').decode(new Uint8Array(record.data));
    for (const needle of ['Zyxwanda', '30524', 'householdSize']) expect(bytes).not.toContain(needle);
  });

  it('keeps a non-extractable AES-GCM key', async () => {
    await saveRecord('answers', SECRET);
    const db = await rawDb();
    const [key] = (await readAll(db, STORE_NAMES.keys)) as CryptoKey[];
    db.close();
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key!.extractable).toBe(false);
    expect(key!.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', key!)).rejects.toThrow();
  });

  it('uses a fresh IV for every write', async () => {
    await saveRecord('a', 1);
    await saveRecord('b', 1);
    const db = await rawDb();
    const records = (await readAll(db, STORE_NAMES.records)) as { iv: Uint8Array }[];
    db.close();
    expect(Array.from(records[0]!.iv)).not.toEqual(Array.from(records[1]!.iv));
  });

  it('binds the record id: a record moved to another id does not decrypt', async () => {
    await saveRecord('answers', SECRET);
    const db = await rawDb();
    const [record] = await readAll(db, STORE_NAMES.records);
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(STORE_NAMES.records, 'readwrite').objectStore(STORE_NAMES.records).put(record, 'other');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
    expect(await loadRecord('other')).toBeUndefined();
  });

  it('deleteEverything removes records and the key', async () => {
    await saveRecord('answers', SECRET);
    await deleteEverything();
    expect(await loadRecord('answers')).toBeUndefined();
    const db = await rawDb();
    expect(await readAll(db, STORE_NAMES.keys)).toEqual([]);
    db.close();
  });
});
