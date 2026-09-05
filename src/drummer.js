/**
 * Drummer+ Mini — step-sequencer audio engine.
 *
 * Each row is a sample instance with a 16-step pattern. Steps can be:
 *   0 = empty, 1 = stab (one-shot), 2 = sustain (held across consecutive greens).
 *
 * Per-row audio: a Tone.Player (or Buffer) routed -> row gain -> drummerGain.
 * Timing uses Tone.Transport for BPM-sync scheduling.
 */
import * as Tone from 'tone';
import { sampleUrl } from './services/samples.js';

const STEPS = 16;
const BASE_MIDI = 60; // C4

let drummerGain = null;
let _started = false;

// Per-row Tone.Player instances keyed by row id.
const rows = new Map(); // id -> { row, player, gain }

const bufferCache = new Map();
const pendingLoads = new Map();

export const state = {
  bpm: 110,
  vol: 0.85,
  rows: [],
  _nextId: 1,
};

function makeRow(kind, folder, file, note) {
  return {
    id: 'r' + (state._nextId++),
    kind,
    folder,
    file,
    note: note || null,
    vol: 1,
    mute: false,
    steps: new Array(STEPS).fill(0),
  };
}

export function addRow(kind, folder, file, note) {
  const row = makeRow(kind, folder, file, note);
  state.rows.push(row);
  ensurePlayer(row);
  loadBuffer(folder, file);
  return row;
}

export function removeRow(id) {
  const rec = rows.get(id);
  if (rec) {
    try { rec.player.dispose(); } catch (e) {}
    rows.delete(id);
  }
  state.rows = state.rows.filter((r) => r.id !== id);
}

export function getRow(id) {
  return state.rows.find((r) => r.id === id) || null;
}

export function clear() {
  stop();
  state.rows.slice().forEach((r) => removeRow(r.id));
}

// ── Buffer loading ──────────────────────────────────────────────────────────

function loadBuffer(folder, file) {
  if (!folder || !file) return Promise.resolve(null);
  const key = folder + '/' + file;
  if (bufferCache.has(key)) return Promise.resolve(bufferCache.get(key));
  if (pendingLoads.has(key)) return pendingLoads.get(key);

  const url = sampleUrl(folder, file);
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    })
    .then((ab) => Tone.context.decodeAudioData(ab))
    .then((buf) => {
      bufferCache.set(key, buf);
      pendingLoads.delete(key);
      return buf;
    })
    .catch(() => {
      pendingLoads.delete(key);
      return null;
    });

  pendingLoads.set(key, p);
  return p;
}

// ── Per-row player ──────────────────────────────────────────────────────────

function ensurePlayer(row) {
  if (rows.has(row.id)) return;
  const player = new Tone.Player();
  const gain = new Tone.Gain(Math.max(0.01, row.vol));
  player.connect(gain);
  gain.connect(drummerGain);
  rows.set(row.id, { row, player, gain });
}

/**
 * Point a row's player at a new buffer (reuse the same Tone.Player).
 */
export function loadSample(rowId, folder, file) {
  const rec = rows.get(rowId);
  if (rec) {
    rec.row.folder = folder;
    rec.row.file = file;
  }
  loadBuffer(folder, file).then((buf) => {
    if (buf && rec) {
      try { rec.player.buffer = buf; } catch (e) {}
    }
  });
}

function preloadAll() {
  return Promise.all(state.rows.map((r) => {
    if (r.folder && r.file) {
      return loadBuffer(r.folder, r.file).then((buf) => {
        const rec = rows.get(r.id);
        if (buf && rec) {
          try { rec.player.buffer = buf; } catch (e) {}
        }
        return !!buf;
      });
    }
    return Promise.resolve(false);
  }));
}

// ── Note -> playbackRate ────────────────────────────────────────────────────

function noteToRate(note) {
  if (!note) return 1;
  const midi = Tone.Frequency(note).toMidi();
  return Math.pow(2, (midi - BASE_MIDI) / 12);
}

// ── Scheduling ──────────────────────────────────────────────────────────────
// Tick-based step sequencer: one Transport repeat per 16th note, and on each
// tick we trigger whichever rows are active on that step. This avoids the
// fragile position-string api for scheduling individual cells.

let currentStep = 0;

function sixteenthDur() {
  return 60 / state.bpm / 4;
}

function triggerRow(row, time, val) {
  const rec = rows.get(row.id);
  if (!rec || row.mute || !rec.player.buffer) return;
  try {
    rec.player.playbackRate = noteToRate(row.note);
    if (val === 2) {
      // Sustain: determine run length of consecutive hold cells from this step.
      let runLen = 1;
      while (row.steps[(currentStep + runLen) % STEPS] === 2) runLen++;
      rec.player.start(time, 0, runLen * sixteenthDur());
    } else {
      rec.player.start(time);
    }
  } catch (e) {}
}

function stepTick(time) {
  onSixteenth(currentStep, time);
  state.rows.forEach((row) => {
    const val = row.steps[currentStep];
    if (val !== 0) triggerRow(row, time, val);
  });
  currentStep = (currentStep + 1) % STEPS;
}

// resetPos: when true the playhead returns to step 0 (used on fresh play);
// when false the current position is preserved so edits take effect in time
// rather than restarting the sequence from the top.
function scheduleAll(resetPos) {
  Tone.Transport.cancel();
  if (resetPos) currentStep = 0;
  Tone.Transport.scheduleRepeat(stepTick, '16n');
}

// Visual callback — overridden by UI via onStep().
function onSixteenth() {}

// Play-state callback — fired when playback actually starts/stops, so the UI
// can stay in sync even though play() starts the transport asynchronously.
let _onPlayState = null;
function firePlayState(playing) {
  try { _onPlayState && _onPlayState(playing); } catch (e) {}
}

function unlockTone() {
  try { Tone.start(); } catch (e) {}
}

// ── Public API ──────────────────────────────────────────────────────────────

export function init(gain) {
  drummerGain = gain;
  Tone.Transport.timeSignature = 4;
  // Pre-create players for any restored rows.
  state.rows.forEach((row) => ensurePlayer(row));
}

export function play() {
  if (_started) return;
  unlockTone();
  Tone.Transport.bpm.value = state.bpm;
  // Load buffers first so the first step isn't silently missed, but fall back
  // to starting after ~2s regardless (loads may be slow on first visit).
  let started = false;
  const start = () => { if (started) return; started = true; scheduleAll(true); Tone.Transport.start(); _started = true; firePlayState(true); };
  const t = setTimeout(start, 2000);
  preloadAll().then((ok) => {
    clearTimeout(t);
    if (ok.every(Boolean)) start();
    else setTimeout(start, 800);
  });
}

export function stop() {
  if (!_started) return;
  Tone.Transport.stop();
  Tone.Transport.cancel();
  rows.forEach((rec) => {
    try { rec.player.stop(); } catch (e) {}
  });
  _started = false;
  firePlayState(false);
}

export function togglePlay() {
  if (_started) stop();
  else play();
}

export function isPlaying() {
  return _started;
}

export function onPlayState(cb) {
  _onPlayState = cb;
}

export function getCurrentStep() {
  return currentStep;
}

export function setBpm(v) {
  state.bpm = Math.round(Math.min(400, Math.max(40, Number(v) || 110)));
  if (_started) Tone.Transport.bpm.value = state.bpm;
}

export function setVol(v) {
  state.vol = Math.min(1, Math.max(0, Number(v)));
  if (drummerGain && drummerGain.gain) {
    drummerGain.gain.value = state.vol;
  }
}

export function setRowVol(id, v) {
  const rec = rows.get(id);
  const row = getRow(id);
  if (row) row.vol = Math.min(1, Math.max(0.01, Number(v)));
  if (rec) {
    try { rec.gain.gain.value = row ? row.vol : 1; } catch (e) {}
  }
}

export function setRowMute(id, muted) {
  const row = getRow(id);
  if (row) row.mute = !!muted;
}

export function setRowNote(id, note) {
  const row = getRow(id);
  if (row) row.note = note ? String(note).trim() : null;
}

export function setStep(id, step, val) {
  const row = getRow(id);
  if (row && step >= 0 && step < STEPS) {
    row.steps[step] = val;
    // Re-schedule without resetting the playhead so a step edit never
    // restarts/loops the sequence from the top mid-playback.
    if (_started) scheduleAll(false);
  }
}

export function onStep(cb) {
  onSixteenth = cb || (() => {});
}

// ── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fk.drummer.state';

export function save() {
  try {
    const data = {
      bpm: state.bpm,
      vol: state.vol,
      nextId: state._nextId,
      rows: state.rows.map((r) => ({
        id: r.id, kind: r.kind, folder: r.folder, file: r.file,
        note: r.note, vol: r.vol, mute: r.mute, steps: r.steps,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}

export function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rows)) return false;

    state.bpm = data.bpm || 110;
    state.vol = data.vol != null ? data.vol : 0.85;
    state._nextId = data.nextId || data.rows.length + 1;
    state.rows = data.rows.map((r) => ({
      id: r.id || 'r' + (state._nextId++),
      kind: r.kind || 'drum',
      folder: r.folder || '',
      file: r.file || '',
      note: r.note || null,
      vol: r.vol != null ? r.vol : 1,
      mute: !!r.mute,
      steps: Array.isArray(r.steps) ? r.steps.slice(0, STEPS) : new Array(STEPS).fill(0),
    }));

    state.rows.forEach((row) => {
      ensurePlayer(row);
      if (row.folder && row.file) {
        loadBuffer(row.folder, row.file).then((buf) => {
          const rec = rows.get(row.id);
          if (buf && rec) {
            try { rec.player.buffer = buf; } catch (e) {}
          }
        });
      }
    });
    return true;
  } catch (e) {
    return false;
  }
}

export { STEPS };
