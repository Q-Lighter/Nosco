// storage.js — thin IndexedDB wrapper. No external library, just the browser's built-in database.
// Two stores: 'meta' holds the salt (must stay readable before you're unlocked), 'vault' holds
// the single encrypted blob containing all of Nosco's real data.

const DB_NAME = 'nosco-db';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, storeName, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function set(storeName, key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, storeName, 'readwrite').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const getSaltRecord = () => get('meta', 'salt');
export const setSaltRecord = (saltB64) => set('meta', 'salt', saltB64);

export const getVault = () => get('vault', 'data');
export const setVault = (encryptedRecord) => set('vault', 'data', encryptedRecord);

/** True if a vault already exists — determines lock screen vs. first-run setup screen. */
export async function hasExistingVault() {
  const salt = await getSaltRecord();
  return salt !== null;
}
