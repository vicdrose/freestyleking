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
const MAX_PATTERNS = 8;

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
  // Per-section pattern settings. count = how many 16-step patterns the
  // section has; cur = the one currently displayed/edited (and the point a
  // play session starts cycling from).
  sections: {
    drum: { count: 1, cur: 0 },
    pad: { count: 1, cur: 0, choke: true },
    bass: { count: 1, cur: 0, choke: true },
    sfx: { count: 1, cur: 0 },
  },
};

// Live per-section pattern index while playing (advances on each bar).
const live = { drum: 0, pad: 0, bass: 0, sfx: 0 };

function sectionOf(kind) {
  return state.sections[kind] || state.sections.drum;
}

function livePatternFor(kind) {
  return live[kind] != null ? live[kind] : sectionOf(kind).cur;
}

function makeRow(kind, folder, file, note) {
  return {
    id: 'r' + (state._nextId++),
    kind,
    folder,
    file,
    note: note || null,
    vol: 1,
    mute: false,
    patterns: [new Array(STEPS).fill(0)],
  };
}

export function addRow(kind, folder, file, note) {
  const row = makeRow(kind, folder, file, note);
  // Match the section's current pattern count so a fresh row works end-to-end.
  const sc = sectionOf(row.kind);
  while (row.patterns.length < sc.count) {
    row.patterns.push((row.patterns[0] || new Array(STEPS).fill(0)).slice());
  }
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

/**
 * One-shot demo of a sample: loads (or reuses) the buffer, builds a transient
 * Player routed through drummerGain, plays it and disposes when done.
 */
export function preview(folder, file, note) {
  if (!folder || !file) return;
  loadBuffer(folder, file).then((buf) => {
    if (!buf) return;
    try {
      const p = new Tone.Player();
      p.buffer = buf;
      p.playbackRate = noteToRate(note);
      p.connect(drummerGain);
      p.start();
      const ms = (buf.duration + 0.2) * 1000;
      setTimeout(() => {
        try { p.dispose(); } catch (e) {}
      }, ms);
    } catch (e) {}
  });
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

function triggerRow(row, time, val, liveIdx) {
  const rec = rows.get(row.id);
  if (!rec || row.mute || !rec.player.buffer) return;
  const pat = row.patterns[liveIdx] || row.patterns[0];
  try {
    rec.player.playbackRate = noteToRate(row.note);
    if (val === 2) {
      // Sustain: determine run length of consecutive hold cells from this step.
      let runLen = 1;
      while (pat[(currentStep + runLen) % STEPS] === 2) runLen++;
      rec.player.start(time, 0, runLen * sixteenthDur());
    } else {
      rec.player.start(time);
    }
    // Choke: when this row's section has choke on, cut off every other row in
    // the same section that's still sounding (monophonic-ish behaviour). With
    // choke off, rows can overlap freely (polyphony).
    if (sectionOf(row.kind).choke) {
      state.rows.forEach((other) => {
        if (other.id === row.id || other.kind !== row.kind) return;
        const orec = rows.get(other.id);
        if (!orec) return;
        try { orec.player.stop(time); } catch (e) {}
      });
    }
  } catch (e) {}
}

function stepTick(time) {
  onSixteenth(currentStep, time);
  state.rows.forEach((row) => {
    const liveIdx = livePatternFor(row.kind);
    const pat = row.patterns[liveIdx] || row.patterns[0];
    const val = pat[currentStep];
    if (val !== 0) triggerRow(row, time, val, liveIdx);
  });
  currentStep = (currentStep + 1) % STEPS;
  if (currentStep === 0) {
    // Bar boundary: each section moves on to its next pattern.
    Object.keys(state.sections).forEach((k) => {
      const s = state.sections[k];
      live[k] = ((live[k] != null ? live[k] : s.cur) + 1) % s.count;
      fireSectionPattern(k, live[k]);
    });
  }
}

// resetPos: when true the playhead returns to step 0 (used on fresh play);
// when false the current position is preserved so edits take effect in time
// rather than restarting the sequence from the top.
function scheduleAll(resetPos) {
  Tone.Transport.cancel();
  if (resetPos) {
    currentStep = 0;
    Object.keys(state.sections).forEach((k) => {
      live[k] = state.sections[k].cur;
      fireSectionPattern(k, live[k]);
    });
  }
  Tone.Transport.scheduleRepeat(stepTick, '16n');
}

// Visual callback — overridden by UI via onStep().
function onSixteenth() {}

// Section-pattern callback — fired when a section's pattern index changes
// (play start, bar advance while playing, navigation, count change, stop).
let _onSectionPattern = null;
function fireSectionPattern(kind, idx) {
  try { _onSectionPattern && _onSectionPattern(kind, idx); } catch (e) {}
}

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
  Object.keys(state.sections).forEach((k) => {
    live[k] = state.sections[k].cur;
    fireSectionPattern(k, live[k]);
  });
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

export function setStep(id, pattern, step, val) {
  const row = getRow(id);
  if (!row) return;
  const pat = row.patterns[pattern] || row.patterns[row.patterns.length - 1];
  if (pat && step >= 0 && step < STEPS) {
    pat[step] = val;
    // Re-schedule without resetting the playhead so a step edit never
    // restarts/loops the sequence from the top mid-playback.
    if (_started) scheduleAll(false);
  }
}

export function onStep(cb) {
  onSixteenth = cb || (() => {});
}

// ── Per-section pattern navigation ──────────────────────────────────────────

export function getSection(kind) {
  return sectionOf(kind);
}

/**
 * Select which pattern of a section is displayed/edited. While playing it also
 * jumps that section's song position to the new pattern.
 */
export function setPattern(kind, idx) {
  const s = sectionOf(kind);
  s.cur = Math.max(0, Math.min(s.count - 1, idx || 0));
  if (_started) live[kind] = s.cur;
  fireSectionPattern(kind, s.cur);
}

/**
 * Grow or shrink the section's pattern count (1..MAX_PATTERNS). Growing
 * duplicates the currently selected pattern into every new slot so the user
 * can nudge copies rather than rebuild from scratch. Shrinking drops the
 * trailing patterns.
 */
export function setPatternCount(kind, n) {
  const s = sectionOf(kind);
  const target = Math.max(1, Math.min(MAX_PATTERNS, Math.round(n)));
  if (!Number.isFinite(target) || target === s.count) return s.count;
  const rowsK = state.rows.filter((r) => r.kind === kind);
  if (target > s.count) {
    const src = s.cur;
    rowsK.forEach((r) => {
      const base = (r.patterns[src] || new Array(STEPS).fill(0)).slice();
      while (r.patterns.length < target) r.patterns.push(base.slice());
    });
    s.cur = target - 1;
  } else {
    rowsK.forEach((r) => { r.patterns.length = target; });
    s.cur = Math.min(s.cur, target - 1);
  }
  s.count = target;
  if (_started) live[kind] = s.cur;
  fireSectionPattern(kind, s.cur);
  return s.count;
}

export function setChoke(kind, v) {
  const s = sectionOf(kind);
  s.choke = !!v;
}

export function onSectionPattern(cb) {
  _onSectionPattern = cb || null;
}

// ── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fk.drummer.state';

/**
 * Serialize the full rack — rows (kind, folder, file, note, vol, mute,
 * per-pattern steps) plus master bpm/vol and per-section pattern counts.
 * Used by the named-rack save feature.
 */
export function serialize() {
  return {
    bpm: state.bpm,
    vol: state.vol,
    nextId: state._nextId,
    sections: Object.keys(state.sections).reduce((acc, k) => {
      acc[k] = { count: state.sections[k].count, cur: state.sections[k].cur, choke: !!state.sections[k].choke };
      return acc;
    }, {}),
    rows: state.rows.map((r) => ({
      kind: r.kind,
      folder: r.folder,
      file: r.file,
      note: r.note,
      vol: r.vol,
      mute: r.mute,
      patterns: r.patterns.map((p) => p.slice(0, STEPS)),
    })),
  };
}

// Build fresh state (new row ids) from serialized rack data, wiring up players
// and buffers. Shared by restore() and applyRack().
function setStateFromData(data) {
  state.bpm = data.bpm || 110;
  state.vol = data.vol != null ? data.vol : 0.85;
  state._nextId = data.nextId || (data.rows || []).length + 1;
  Object.keys(state.sections).forEach((k) => {
    const d = (data.sections || {})[k];
    state.sections[k].count = d && d.count > 0 ? Math.min(MAX_PATTERNS, d.count) : 1;
    state.sections[k].cur = d && d.cur != null ? Math.min(Math.max(0, d.cur), state.sections[k].count - 1) : 0;
    state.sections[k].choke = d && d.choke != null ? !!d.choke : (k === 'pad' || k === 'bass');
    live[k] = state.sections[k].cur;
  });
  state.rows = (data.rows || []).map((r) => {
    const patterns = Array.isArray(r.patterns)
      ? r.patterns.slice(0, MAX_PATTERNS).map((p) =>
          Array.isArray(p) ? p.map((v) => (v === 1 || v === 2 ? v : 0)).slice(0, STEPS) : new Array(STEPS).fill(0))
      : [Array.isArray(r.steps)
          ? r.steps.map((v) => (v === 1 || v === 2 ? v : 0)).slice(0, STEPS)
          : new Array(STEPS).fill(0)];
    const row = {
      id: 'r' + (state._nextId++),
      kind: r.kind || 'drum',
      folder: r.folder || '',
      file: r.file || '',
      note: (r.note !== undefined && r.note !== null) ? r.note : null,
      vol: r.vol != null ? r.vol : 1,
      mute: !!r.mute,
      patterns,
    };
    // Make sure the row has exactly the section's pattern count.
    const sc = sectionOf(row.kind);
    while (row.patterns.length < sc.count) {
      row.patterns.push((row.patterns[0] || new Array(STEPS).fill(0)).slice());
    }
    row.patterns.length = sc.count;
    return row;
  });

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
}

/**
 * Replace the current rack with a saved one. Stops playback, tears down all
 * rows/players, and rebuilds the state; buffers load in the background.
 * Returns the new row objects so the UI can re-render them.
 */
export function applyRack(data) {
  stop();
  state.rows.slice().forEach((r) => removeRow(r.id));
  if (!data || !Array.isArray(data.rows)) return [];
  setStateFromData(data);
  return state.rows;
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
  } catch (e) {}
}

export function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rows)) return false;
    setStateFromData(data);
    return true;
  } catch (e) {
    return false;
  }
}

export { STEPS };
