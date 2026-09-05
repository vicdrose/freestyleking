/**
 * Freestyle King — in-app Library.
 *
 * Saved combined tracks live in IndexedDB, the app's own persistent storage:
 * no filesystem access needed, works offline and identically on the phone and
 * desktop. Each record stores the WAV blob plus name/meta so the Library can
 * list, replay and delete tracks forever.
 */
const DB_NAME = 'fk-library';
const DB_VERSION = 1;
const STORE = 'tracks';

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

export function putTrack(rec) {
  if (!rec || !rec.id) return Promise.reject(new Error('track id required'));
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = () => reject(tx.error);
  }));
}

export function saveTrack(name, blob, duration) {
  const rec = {
    id: newId(),
    name: String(name || '').trim() || 'Untitled',
    blob,
    duration: Number.isFinite(duration) ? duration : 0,
    size: blob ? blob.size : 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  return putTrack(rec);
}

export function listTracks() {
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

export function getTrack(id) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}

export function deleteTrack(id) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}