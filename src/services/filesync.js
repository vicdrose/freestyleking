/**
 * Freestyle King — cross-device sync layer.
 *
 * One storage adapter seam with three backends, picked automatically:
 *
 *   folder : File System Access API directory handle (desktop Chrome/Edge).
 *            The app reads/writes a per-user folder (default name: Freestyle King)
 *            whose contents sync between devices via Syncthing or any folder
 *            sync. Best experience: permission persists after one grant.
 *   share  : no directory picker (Android/iOS). The browser store is still the
 *            live store; Export writes one backup file you drop into your synced
 *            folder, Import reads it back.
 *   legacy : neither API — plain localStorage/IndexedDB, unchanged behavior.
 *
 * Folder contract (inside the synced folder):
 *   tracks.json         meta for every track: [{id,name,duration,size,createdAt,updatedAt}]
 *   tracks/<id>.wav     the rendered audio for each saved track
 *   racks.json          drummer+"saved racks": { "<name>": { savedAt, ...rack } }
 *   drummer-state.json  the live drummer+ rack (drummer.serialize())
 *   settings.json       a few global keys, as { "<localStorageKey>": "<value>" }
 *
 * Conflict policy is last-writer-wins: on load the folder is authoritative
 * (tracks merge by id/updatedAt, whole-file JSONs replace the local copy when
 * they differ); every local change is then mirrored back to the folder within
 * seconds. Imports always merge and never delete.
 */
import { listTracks, getTrack, putTrack } from '../library.js';

const LS_STATE = 'fk.drummer.state';
const LS_RACKS = 'fk.drummer.racks';
const SETTING_KEYS = ['fk.sectionOrder', 'fk-asSeconds', 'fk-asMult', 'fk.autoBeatRate', 'fkAdvancedPlayer'];
const BACKUP_NAME = 'freestyleking-backup.json';
const KV_DB = 'fk-meta';
const KV_KEY = 'dirHandle';

let dirHandle = null;
let dirName = '';
let lastSignature = '';
let lastStateSig = '';
let lastRackSig = '';
let lastSettingsSig = '';
let lastTrackSig = '';
let lastTrackMap = null;

const b64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

function kvOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KV_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) {
        req.result.createObjectStore('kv', { keyPath: 'k' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(k) {
  try {
    const db = await kvOpen();
    return await new Promise((resolve) => {
      const r = db.transaction('kv', 'readonly').objectStore('kv').get(k);
      r.onsuccess = () => resolve(r.result ? r.result.v : null);
      r.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

async function kvSet(k, v) {
  try {
    const db = await kvOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k, v });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

export function getMode() {
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) return 'folder';
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) return 'share';
  return 'legacy';
}

export function folderStatus() {
  return { connected: !!dirHandle, name: dirName, mode: getMode() };
}

export async function loadHandle() {
  dirHandle = await kvGet(KV_KEY);
  dirName = dirHandle && dirHandle.name ? dirHandle.name : '';
  if (dirHandle) {
    try {
      const p = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (p === 'granted') return true;
      const r = await dirHandle.requestPermission({ mode: 'readwrite' });
      return r === 'granted';
    } catch (e) { return false; }
  }
  return false;
}

function writeToDocument(files) {
  files.forEach((file) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
}

export async function connectFolder() {
  if (getMode() !== 'folder') return { ok: false, error: 'no-folder-api' };
  let root;
  try {
    root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'fk-sync' });
  } catch (e) {
    return { ok: false, error: e && (e.name === 'AbortError' || e.message === 'AbortError') ? 'cancelled' : 'denied' };
  }
  try {
    await root.getDirectoryHandle('tracks', { create: true });
    await root.getDirectoryHandle('racks', { create: true });
  } catch (e) {
    return { ok: false, error: 'setup-failed' };
  }
  dirHandle = root;
  dirName = root.name || '';
  await kvSet(KV_KEY, root);
  lastSignature = '';
  lastTrackSig = '';
  lastTrackMap = null;
  return { ok: true, name: dirName };
}

export async function disconnectFolder() {
  dirHandle = null;
  dirName = '';
  await kvSet(KV_KEY, null);
  lastSignature = '';
  lastTrackSig = '';
  lastTrackMap = null;
}

// Adopt a folder handle without the native picker. Exposed for testing and as
// the seam a native (Capacitor) wrapper would use to hand the app a handle
// from the platform's own folder picker.
export function setDirHandle(root) {
  dirHandle = root;
  dirName = root && root.name ? root.name : '';
  lastSignature = '';
  lastTrackSig = '';
  lastTrackMap = null;
  return folderStatus();
}

async function readJson(root, name) {
  try {
    const fh = await root.getFileHandle(name);
    const f = await fh.getFile();
    const parsed = JSON.parse(await f.text());
    return { data: parsed, mtime: f.lastModified || 0 };
  } catch (e) { return null; }
}

export async function readDirBundle() {
  if (!dirHandle) return null;
  const raw = { tracks: [], tracksIndex: null, racks: null, drummerState: null, settings: null };
  try {
    const fh = await dirHandle.getFileHandle('tracks.json');
    const f = await fh.getFile();
    raw.tracksIndex = { data: JSON.parse(await f.text()), mtime: f.lastModified || 0 };
  } catch (e) { raw.tracksIndex = null; }

  try {
    const td = await dirHandle.getDirectoryHandle('tracks', { create: false });
    for await (const [name, h] of td.entries()) {
      if (!/\.wav$/i.test(name) || !h.getFile) continue;
      const f = await h.getFile();
      raw.tracks.push({ id: name.replace(/\.wav$/i, ''), fileName: name, blob: f, size: f.size || 0, mtime: f.lastModified || 0 });
    }
  } catch (e) {}

  raw.racks = await readJson(dirHandle, 'racks.json');
  raw.drummerState = await readJson(dirHandle, 'drummer-state.json');
  raw.settings = await readJson(dirHandle, 'settings.json');

  const tracks = [];
  const seen = new Set();
  (raw.tracksIndex && raw.tracksIndex.data ? raw.tracksIndex.data : []).forEach((meta) => {
    if (!meta || !meta.id) return;
    const wav = raw.tracks.find((t) => t.id === meta.id);
    seen.add(meta.id);
    tracks.push({
      id: meta.id,
      name: meta.name,
      duration: meta.duration || 0,
      size: wav ? wav.size : meta.size || 0,
      createdAt: meta.createdAt || 0,
      updatedAt: meta.updatedAt || meta.createdAt || 0,
      blob: wav ? wav.blob : null,
      mtime: wav ? wav.mtime : 0,
    });
  });
  // WAVs present on disk with no index entry (index out of sync) still merge.
  raw.tracks.forEach((t) => {
    if (seen.has(t.id)) return;
    tracks.push({ id: t.id, name: t.id, duration: 0, size: t.size, createdAt: t.mtime, updatedAt: t.mtime, blob: t.blob, mtime: t.mtime });
  });

  return {
    tracks,
    racks: raw.racks ? raw.racks.data : null,
    racksMtime: raw.racks ? raw.racks.mtime : 0,
    drummerState: raw.drummerState ? raw.drummerState.data : null,
    stateMtime: raw.drummerState ? raw.drummerState.mtime : 0,
    settings: raw.settings ? raw.settings.data : null,
    settingsMtime: raw.settings ? raw.settings.mtime : 0,
  };
}

export function localSettings() {
  const out = {};
  SETTING_KEYS.forEach((k) => {
    try {
      const v = localStorage.getItem(k);
      if (v != null) out[k] = v;
    } catch (e) {}
  });
  return out;
}

function localRacks() {
  try { return JSON.parse(localStorage.getItem(LS_RACKS)) || {}; } catch (e) { return {}; }
}

function localState() {
  try { return localStorage.getItem(LS_STATE); } catch (e) { return null; }
}

function localStateObj() {
  const s = localState();
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

export async function mergeBundle(bundle) {
  const res = { tracksAdded: 0, stateChanged: false, racksChanged: false, settingsChanged: false, state: null };

  if (bundle.tracks && bundle.tracks.length) {
    const local = await listTracks();
    const localMap = new Map((local || []).map((t) => [t.id, t]));
    const promises = bundle.tracks.map(async (t) => {
      const cur = localMap.get(t.id);
      const incoming = t.updatedAt || t.createdAt || t.mtime || 0;
      const existing = cur ? (cur.updatedAt || cur.createdAt || 0) : 0;
      if (cur && incoming <= existing) return;
      if (!t.blob) {
        const localBlob = cur ? cur.blob : null;
        if (!localBlob) return;
        await putTrack({ ...t, blob: localBlob, createdAt: t.createdAt || cur.createdAt || Date.now(), updatedAt: incoming });
      } else {
        await putTrack({ id: t.id, name: t.name || 'Untitled', duration: t.duration || 0, size: t.size || t.blob.size || 0, blob: t.blob, createdAt: t.createdAt || 0, updatedAt: incoming });
      }
      res.tracksAdded += 1;
    });
    await Promise.all(promises);
  }

  if (bundle.drummerState && typeof bundle.drummerState === 'object') {
    const incoming = JSON.stringify(bundle.drummerState);
    if (incoming !== localState()) {
      try { localStorage.setItem(LS_STATE, incoming); } catch (e) {}
      res.stateChanged = true;
      res.state = bundle.drummerState;
    }
  }

  if (bundle.racks && typeof bundle.racks === 'object') {
    const merged = Object.assign({}, localRacks());
    Object.keys(bundle.racks).forEach((name) => {
      const inR = bundle.racks[name];
      const cur = merged[name] || null;
      const inTime = (inR && inR.savedAt) || 0;
      const curTime = (cur && cur.savedAt) || 0;
      if (!cur || inTime >= curTime) merged[name] = inR;
    });
    const incoming = JSON.stringify(merged);
    if (incoming !== JSON.stringify(localRacks())) {
      try { localStorage.setItem(LS_RACKS, incoming); } catch (e) {}
      res.racksChanged = true;
    }
  }

  if (bundle.settings && typeof bundle.settings === 'object') {
    try {
      Object.keys(bundle.settings).forEach((k) => {
        if (SETTING_KEYS.indexOf(k) === -1) return;
        localStorage.setItem(k, String(bundle.settings[k]));
        res.settingsChanged = true;
      });
    } catch (e) {}
  }

  return res;
}

export async function buildMetaBundle() {
  const tracks = await listTracks();
  const meta = {
    tracks: (tracks || []).map((t) => ({
      id: t.id,
      name: t.name,
      duration: t.duration || 0,
      size: t.size || (t.blob ? t.blob.size : 0) || 0,
      createdAt: t.createdAt || 0,
      updatedAt: t.updatedAt || t.createdAt || Date.now(),
    })),
    racks: localRacks(),
    drummerState: localStateObj(),
    settings: localSettings(),
  };
  meta.signature = JSON.stringify({
    tracks: meta.tracks,
    racks: meta.racks,
    drummerState: meta.drummerState,
    settings: meta.settings,
  });
  return meta;
}

async function writeFile(root, name, content) {
  try {
    const fh = await root.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
    return true;
  } catch (e) { return false; }
}

async function writeBlob(root, dir, fileName, blob) {
  try {
    const td = await root.getDirectoryHandle(dir, { create: true });
    const fh = await td.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (e) { return false; }
}

async function mirrorState(meta) {
  const sig = meta.signature;
  if (sig === lastSignature) return { wrote: false };
  lastSignature = sig;

  let wrote = 0;
  const stateStr = meta.drummerState ? JSON.stringify(meta.drummerState) : null;
  if (stateStr && stateStr !== lastStateSig) {
    lastStateSig = stateStr;
    if (await writeFile(dirHandle, 'drummer-state.json', stateStr)) wrote += 1;
  }
  const racksStr = JSON.stringify(meta.racks);
  if (racksStr !== lastRackSig) {
    lastRackSig = racksStr;
    if (await writeFile(dirHandle, 'racks.json', racksStr)) wrote += 1;
  }
  const settingsStr = JSON.stringify(meta.settings);
  if (settingsStr !== lastSettingsSig) {
    lastSettingsSig = settingsStr;
    if (await writeFile(dirHandle, 'settings.json', settingsStr)) wrote += 1;
  }
  const tracksStr = JSON.stringify(meta.tracks);
  if (tracksStr !== lastTrackSig) {
    lastTrackSig = tracksStr;
    if (await writeFile(dirHandle, 'tracks.json', tracksStr)) wrote += 1;
    await writeTrackWavs(meta);
  }
  return { wrote };
}

// Write WAVs for tracks that are new or whose metadata changed since the last
// mirror, so a track saved mid-session lands in the folder immediately rather
// than waiting for the next launch/connect full mirror.
async function writeTrackWavs(meta) {
  const prevMap = lastTrackMap || new Map();
  const nextMap = new Map();
  await Promise.all(meta.tracks.map(async (t) => {
    nextMap.set(t.id, t);
    const prev = prevMap.get(t.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(t)) return;
    try {
      const rec = await getTrack(t.id);
      if (rec && rec.blob) await writeBlob(dirHandle, 'tracks', t.id + '.wav', rec.blob);
    } catch (e) {}
  }));
  lastTrackMap = nextMap;
}

export async function writeMirror() {
  if (!dirHandle) return { wrote: false };
  const meta = await buildMetaBundle();
  return mirrorState(meta);
}

export async function writeMirrorBundle() {
  if (!dirHandle) return;
  const meta = await buildMetaBundle();
  lastSignature = '';
  lastTrackSig = '';
  lastTrackMap = null;
  await mirrorState(meta);
  await writeTrackWavs(meta);
}

export async function exportSingleFile() {
  const meta = await buildMetaBundle();
  const tracks = await listTracks();
  const files = [];
  for (const t of tracks || []) {
    const rec = await getTrack(t.id);
    if (!rec || !rec.blob) continue;
    files.push({
      id: rec.id,
      name: rec.name,
      duration: rec.duration || 0,
      size: rec.size || rec.blob.size || 0,
      createdAt: rec.createdAt || 0,
      updatedAt: rec.updatedAt || rec.createdAt || Date.now(),
      dataUrl: 'data:audio/wav;base64,' + await b64(rec.blob),
    });
  }
  const backup = {
    version: 1,
    createdAt: Date.now(),
    tracks: files,
    racks: meta.racks,
    drummerState: meta.drummerState,
    settings: meta.settings,
  };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const file = new File([blob], BACKUP_NAME, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Freestyle King data' });
      return { shared: true, name: BACKUP_NAME };
    } catch (e) {}
  }
  writeToDocument([file]);
  return { shared: false, name: BACKUP_NAME };
}

function jsonFromFile(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => { try { resolve(JSON.parse(String(r.result))); } catch (e) { resolve(null); } };
    r.onerror = () => resolve(null);
    r.readAsText(file);
  });
}

export async function importFiles(fileList) {
  const files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return { merged: false, reason: 'empty' };

  const backupFile = files.find((f) => f.name === BACKUP_NAME);
  if (backupFile) {
    const data = await jsonFromFile(backupFile);
    if (!data) return { merged: false, reason: 'bad-backup' };
    const tracks = [];
    for (const t of data.tracks || []) {
      tracks.push({
        id: t.id,
        name: t.name,
        duration: t.duration || 0,
        size: t.size || 0,
        createdAt: t.createdAt || 0,
        updatedAt: t.updatedAt || t.createdAt || 0,
        blob: t.dataUrl ? await (async () => {
          try {
            const res = await fetch(t.dataUrl);
            return await res.blob();
          } catch (e) { return null; }
        })() : null,
      });
    }
    const res = await mergeBundle({ tracks, racks: data.racks, drummerState: data.drummerState, settings: data.settings });
    res.merged = true;
    res.state = data.drummerState;
    return res;
  }

  // Folder-dump import: tracks.json (+ any *.wav), racks.json, drummer-state.json, settings.json.
  const indexFile = files.find((f) => f.name === 'tracks.json');
  const indexData = indexFile ? await jsonFromFile(indexFile) : null;
  const wavs = files.filter((f) => /\.wav$/i.test(f.name));
  const tracks = [];
  (indexData || []).forEach((meta) => {
    if (!meta || !meta.id) return;
    const wav = wavs.find((f) => f.name === meta.id + '.wav') || null;
    tracks.push({
      id: meta.id,
      name: meta.name,
      duration: meta.duration || 0,
      size: meta.size || 0,
      createdAt: meta.createdAt || 0,
      updatedAt: meta.updatedAt || meta.createdAt || 0,
      blob: wav || null,
    });
  });
  wavs.forEach((wav) => {
    const id = wav.name.replace(/\.wav$/i, '');
    if (tracks.some((t) => t.id === id)) return;
    tracks.push({ id, name: id, duration: 0, size: wav.size || 0, createdAt: 0, updatedAt: wav.lastModified || 0, blob: wav });
  });

  const racksFile = files.find((f) => f.name === 'racks.json');
  const stateFile = files.find((f) => f.name === 'drummer-state.json');
  const settingsFile = files.find((f) => f.name === 'settings.json');
  const res = await mergeBundle({
    tracks,
    racks: racksFile ? await jsonFromFile(racksFile) : null,
    drummerState: stateFile ? await jsonFromFile(stateFile) : null,
    settings: settingsFile ? await jsonFromFile(settingsFile) : null,
  });
  res.merged = true;
  res.state = stateFile ? await jsonFromFile(stateFile) : null;
  return res;
}