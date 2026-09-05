/**
 * Drummer+ Mini — step-sequencer audio engine.
 *
 * Each row is a sample instance. Data layout per row:
 *   row.clips[clipIdx].patterns[patternIdx][step]  (step: 0, 1=stab, 2=sustain)
 * Sections hold an array of clips; the active clip (`section.clip`) is what you
 * see/edit and what plays. While playing, each section cycles its active clip's
 * patterns (live index advances per bar). Only the selected clip plays.
 *
 * Per-row audio: a Tone.Player (or Buffer) routed -> row gain -> drummerGain.
 * Timing uses Tone.Transport for BPM-sync scheduling.
 */
import * as Tone from 'tone';
import { sampleUrl } from './services/samples.js';

const STEPS = 16;
const BASE_MIDI = 60; // C4
const MAX_PATTERNS = 8;
const MAX_CLIPS = 32;

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
  // Per-section clip settings. clips[c] = one clip (count patterns, cur = the
  // one currently displayed within that clip). clip = which clip is active.
  sections: {
    drum: { clips: [{ count: 1, cur: 0 }], clip: 0, muted: false, solo: false },
    pad: { clips: [{ count: 1, cur: 0 }], clip: 0, choke: true, muted: false, solo: false },
    bass: { clips: [{ count: 1, cur: 0 }], clip: 0, choke: true, muted: false, solo: false },
    sfx: { clips: [{ count: 1, cur: 0 }], clip: 0, muted: false, solo: false },
  },
};

// Live per-section pattern index while playing (advances on each bar).
const live = { drum: 0, pad: 0, bass: 0, sfx: 0 };

function sectionOf(kind) {
  return state.sections[kind] || state.sections.drum;
}

function activeClipHandle(kind) {
  const s = sectionOf(kind);
  if (!Array.isArray(s.clips) || !s.clips.length) s.clips = [{ count: 1, cur: 0 }];
  s.clip = Math.max(0, Math.min(s.clips.length - 1, s.clip || 0));
  return s.clips[s.clip];
}

function livePatternFor(kind) {
  return live[kind] != null ? live[kind] : activeClipHandle(kind).cur;
}

// Solo model: if any row or any section is soloed, only content that is
// soloed (or lives in a soloed section) plays. A mute always wins over a solo.
function hasSolo() {
  return (
    Object.keys(state.sections).some((k) => sectionOf(k).solo) ||
    state.rows.some((r) => r.solo)
  );
}

function rowAudible(row) {
  if (row.mute || sectionOf(row.kind).muted) return false;
  if (!hasSolo()) return true;
  return !!row.solo || !!sectionOf(row.kind).solo;
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
    solo: false,
    clips: [],
  };
}

/**
 * Patterns for the row's active clip (what you currently see/edit/play).
 */
function rowPatterns(row) {
  const s = sectionOf(row.kind);
  const clip = row.clips[s.clip] || row.clips[0];
  return clip ? clip.patterns : [];
}

export function addRow(kind, folder, file, note) {
  const row = makeRow(kind, folder, file, note);
  // Give the new row a matching clip entry for every clip the section has.
  const s = sectionOf(row.kind);
  s.clips.forEach((c) => {
    const patterns = [];
    for (let p = 0; p < c.count; p++) patterns.push(new Array(STEPS).fill(0));
    row.clips.push({ patterns });
  });
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
  if (!rec || !rowAudible(row) || !rec.player.buffer) return;
  const pats = rowPatterns(row);
  const pat = pats[liveIdx] || pats[0];
  if (!pat) return;
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
    const pats = rowPatterns(row);
    const pat = pats[liveIdx] || pats[0];
    if (!pat) return;
    const val = pat[currentStep];
    if (val !== 0) triggerRow(row, time, val, liveIdx);
  });
  currentStep = (currentStep + 1) % STEPS;
  if (currentStep === 0) {
    // Bar boundary: each section moves on to its next pattern (within the
    // active clip). The clip itself only changes when the user switches it.
    Object.keys(state.sections).forEach((k) => {
      const clip = activeClipHandle(k);
      live[k] = ((live[k] != null ? live[k] : clip.cur) + 1) % clip.count;
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
      const clip = activeClipHandle(k);
      live[k] = clip.cur;
      fireSectionPattern(k, live[k]);
    });
  }
  Tone.Transport.scheduleRepeat(stepTick, '16n');
}

// Visual callback — overridden by UI via onStep().
function onSixteenth() {}

// Section-pattern callback — fired when a section's pattern index changes
// (play start, bar advance while playing, navigation, count change, stop,
// clip switch).
let _onSectionPattern = null;
function fireSectionPattern(kind, idx) {
  try { _onSectionPattern && _onSectionPattern(kind, idx); } catch (e) {}
}

// Clip callback — fired when a section's active clip changes.
let _onClipChange = null;
function fireClipChange(kind, idx) {
  try { _onClipChange && _onClipChange(kind, idx); } catch (e) {}
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
    const clip = activeClipHandle(k);
    live[k] = clip.cur;
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

export function setRowSolo(id, solo) {
  const row = getRow(id);
  if (row) row.solo = !!solo;
}

export function isRowAudible(id) {
  const row = getRow(id);
  return row ? rowAudible(row) : false;
}

export function setRowNote(id, note) {
  const row = getRow(id);
  if (row) row.note = note ? String(note).trim() : null;
}

export function setStep(id, pattern, step, val) {
  const row = getRow(id);
  if (!row) return;
  const pats = rowPatterns(row);
  const pat = pats[pattern] || pats[pats.length - 1];
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

// ── Per-section patterns (within the active clip) ───────────────────────────

export function getSection(kind) {
  return sectionOf(kind);
}

/**
 * Select which pattern of the active clip is displayed/edited. While playing
 * it also jumps the section's song position to that pattern.
 */
export function setPattern(kind, idx) {
  const clip = activeClipHandle(kind);
  clip.cur = Math.max(0, Math.min(clip.count - 1, idx || 0));
  if (_started) live[kind] = clip.cur;
  fireSectionPattern(kind, clip.cur);
}

/**
 * Grow or shrink the active clip's pattern count (1..MAX_PATTERNS). Growing
 * duplicates the currently selected pattern into every new slot; shrinking
 * drops the trailing patterns.
 */
export function setPatternCount(kind, n) {
  const s = sectionOf(kind);
  const clip = activeClipHandle(kind);
  const target = Math.max(1, Math.min(MAX_PATTERNS, Math.round(n)));
  if (!Number.isFinite(target) || target === clip.count) return clip.count;
  const rowsK = state.rows.filter((r) => r.kind === kind);
  if (target > clip.count) {
    const src = clip.cur;
    rowsK.forEach((r) => {
      const cp = r.clips[s.clip] || r.clips[0];
      if (!cp) return;
      const base = (cp.patterns[src] || new Array(STEPS).fill(0)).slice();
      while (cp.patterns.length < target) cp.patterns.push(base.slice());
    });
    clip.cur = target - 1;
  } else {
    rowsK.forEach((r) => {
      const cp = r.clips[s.clip] || r.clips[0];
      if (cp) cp.patterns.length = target;
    });
    clip.cur = Math.min(clip.cur, target - 1);
  }
  clip.count = target;
  if (_started) live[kind] = clip.cur;
  fireSectionPattern(kind, clip.cur);
  return clip.count;
}

export function setChoke(kind, v) {
  const s = sectionOf(kind);
  s.choke = !!v;
}

export function setSectionMute(kind, v) {
  const s = sectionOf(kind);
  s.muted = !!v;
}

export function setSectionSolo(kind, v) {
  const s = sectionOf(kind);
  s.solo = !!v;
}

export { hasSolo };

export function onSectionPattern(cb) {
  _onSectionPattern = cb || null;
}

// ── Per-section clips ───────────────────────────────────────────────────────

export function getClip(kind) {
  return sectionOf(kind).clip;
}

export function getClips(kind) {
  return sectionOf(kind).clips.length;
}

/**
 * Select which clip of a section is active. While playing it also jumps the
 * section's song position to that clip's current pattern.
 */
export function setClip(kind, idx) {
  const s = sectionOf(kind);
  const target = Math.max(0, Math.min(s.clips.length - 1, idx || 0));
  s.clip = target;
  const clip = s.clips[target];
  if (_started) live[kind] = clip.cur;
  fireSectionPattern(kind, live[kind] != null ? live[kind] : clip.cur);
  fireClipChange(kind, target);
}

/**
 * Add a clip by duplicating the active one (content + pattern count + current
 * pattern), then switch to it. Returns the new clip index.
 */
export function addClip(kind) {
  unlockTone();
  const s = sectionOf(kind);
  const srcClip = activeClipHandle(kind);
  const srcByRow = new Map();
  state.rows.filter((r) => r.kind === kind).forEach((r) => {
    const src = r.clips[s.clip] || r.clips[0];
    srcByRow.set(r.id, src ? src.patterns.map((p) => p.slice()) : []);
  });
  const newClip = { count: srcClip.count, cur: Math.min(srcClip.count - 1, srcClip.cur) };
  s.clips.push(newClip);
  const newIdx = s.clips.length - 1;
  state.rows.filter((r) => r.kind === kind).forEach((r) => {
    r.clips.push({ patterns: (srcByRow.get(r.id) || []).map((p) => p.slice()) });
  });
  s.clip = newIdx;
  if (_started) live[kind] = newClip.cur;
  fireSectionPattern(kind, newClip.cur);
  fireClipChange(kind, newIdx);
  return newIdx;
}

/**
 * Remove a clip. Never removes the last remaining clip.
 */
export function removeClip(kind, idx) {
  const s = sectionOf(kind);
  if (s.clips.length <= 1) return false;
  const target = idx == null ? s.clip : Math.max(0, Math.min(s.clips.length - 1, idx));
  s.clips.splice(target, 1);
  state.rows.filter((r) => r.kind === kind).forEach((r) => r.clips.splice(target, 1));
  s.clip = Math.min(s.clip, s.clips.length - 1);
  const clip = s.clips[s.clip];
  if (_started) live[kind] = clip.cur;
  fireSectionPattern(kind, clip.cur);
  fireClipChange(kind, s.clip);
  return true;
}

/**
 * Scrub the active clip: zero out every pattern of every row (naked clip).
 */
export function clearClip(kind) {
  unlockTone();
  const s = sectionOf(kind);
  state.rows.filter((r) => r.kind === kind).forEach((r) => {
    const cp = r.clips[s.clip] || r.clips[0];
    if (cp) cp.patterns.forEach((p) => p.fill(0));
  });
}

export function onClipChange(cb) {
  _onClipChange = cb || null;
}

// ── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fk.drummer.state';

function sanitizePattern(pat) {
  return Array.isArray(pat) ? pat.map((v) => (v === 1 || v === 2 ? v : 0)).slice(0, STEPS) : new Array(STEPS).fill(0);
}

/**
 * Serialize the full rack — rows (kind, folder, file, note, vol, mute, solo,
 * per-clip per-pattern steps), master bpm/vol, and per-section clips
 * (plus section mute/solo).
 */
export function serialize() {
  return {
    bpm: state.bpm,
    vol: state.vol,
    nextId: state._nextId,
    sections: Object.keys(state.sections).reduce((acc, k) => {
      acc[k] = {
        choke: !!state.sections[k].choke,
        muted: !!state.sections[k].muted,
        solo: !!state.sections[k].solo,
        clip: state.sections[k].clip || 0,
        clips: state.sections[k].clips.map((c) => ({ count: c.count, cur: c.cur })),
      };
      return acc;
    }, {}),
    rows: state.rows.map((r) => ({
      kind: r.kind,
      folder: r.folder,
      file: r.file,
      note: r.note,
      vol: r.vol,
      mute: r.mute,
      solo: r.solo,
      clips: r.clips.map((c) => ({ patterns: c.patterns.map((p) => p.slice(0, STEPS)) })),
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
    const sec = state.sections[k];
    sec.choke = d && d.choke != null ? !!d.choke : (k === 'pad' || k === 'bass');
    sec.muted = !!(d && d.muted);
    sec.solo = !!(d && d.solo);
    if (d && Array.isArray(d.clips) && d.clips.length) {
      sec.clips = d.clips.map((c) => ({
        count: Math.max(1, Math.min(MAX_PATTERNS, c.count || 1)),
        cur: Math.max(0, c.cur || 0),
      }));
    } else {
      // Legacy save: section had { count, cur } only.
      const count = d && d.count > 0 ? Math.min(MAX_PATTERNS, d.count) : 1;
      const cur = d && d.cur != null ? Math.min(Math.max(0, d.cur), count - 1) : 0;
      sec.clips = [{ count, cur }];
    }
    sec.clip = d && d.clip != null ? Math.max(0, Math.min(sec.clips.length - 1, d.clip)) : 0;
    sec.clips.forEach((c) => { c.cur = Math.min(c.cur, c.count - 1); });
    live[k] = sec.clips[sec.clip].cur;
  });
  state.rows = (data.rows || []).map((r) => {
    const row = {
      id: 'r' + (state._nextId++),
      kind: r.kind || 'drum',
      folder: r.folder || '',
      file: r.file || '',
      note: (r.note !== undefined && r.note !== null) ? r.note : null,
      vol: r.vol != null ? r.vol : 1,
      mute: !!r.mute,
      solo: !!r.solo,
      clips: [],
    };
    const sec = sectionOf(row.kind);
    for (let c = 0; c < sec.clips.length; c++) {
      let srcPatterns;
      if (Array.isArray(r.clips) && r.clips[c] && Array.isArray(r.clips[c].patterns)) {
        srcPatterns = r.clips[c].patterns.map(sanitizePattern);
      } else if (c === 0 && Array.isArray(r.patterns)) {
        srcPatterns = r.patterns.map(sanitizePattern);
      } else if (c === 0 && Array.isArray(r.steps)) {
        srcPatterns = [sanitizePattern(r.steps)];
      } else {
        srcPatterns = [];
      }
      while (srcPatterns.length < sec.clips[c].count) srcPatterns.push(new Array(STEPS).fill(0));
      srcPatterns.length = sec.clips[c].count;
      row.clips.push({ patterns: srcPatterns });
    }
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

export { STEPS, MAX_CLIPS };