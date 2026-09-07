/**
 * Freestyle King — on-device beat stash.
 *
 * Loaded audio files are stored in IndexedDB so beats survive offline and
 * across sessions on the phone. Each record holds the audio blob (mp3/m4a/wav,
 * whatever was picked) plus name/meta.
 */
const DB_NAME = 'fk-stash';
const DB_VERSION = 1;
const STORE = 'items';

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

export function saveItem(name, blob) {
  const rec = {
    id: newId(),
    name: String(name || '').trim() || 'Untitled',
    blob,
    size: blob ? blob.size : 0,
    createdAt: Date.now()
  };
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = () => reject(tx.error);
  }));
}

export function listItems() {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  }));
}

export function deleteItem(id) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}