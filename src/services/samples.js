/**
 * Sample playback service.
 *
 * In the legacy PHP application, sample file lists were populated server-side
 * via PHP scandir() against the WordPress theme subdirectories, emitting
 * relative paths (e.g. "./wp-content/themes/thrive-nouveau/breaks/file.wav")
 * into global JS arrays. JavaScript then prepended "https://freestylekingapp.com/"
 * when loading.
 *
 * The existing WordPress/cPanel infrastructure remains the sample backend and
 * is NOT being replaced. This service reproduces the same relative-path arrays
 * (so the URL construction is identical) and loads them through Tone.js.
 */

const HOST = 'https://freestylekingapp.com';

export const SAMPLE_BASE = './wp-content/themes/thrive-nouveau';

// These arrays mirror the relative paths the legacy PHP scandir() emitted.
// They are editable locally so they can be kept in sync with the server's
// theme directories without changing the API contract.
const breaks = [
  `${SAMPLE_BASE}/breaks/sample.wav`
];
const sfx = [
  `${SAMPLE_BASE}/SFX/sample.wav`
];
const fills = [
  `${SAMPLE_BASE}/drumfills/sample.wav`
];
const pads = [
  `${SAMPLE_BASE}/samples/pads/sample.wav`
];
const bass = [
  `${SAMPLE_BASE}/bass/sample.wav`
];
const beats = [
  `${SAMPLE_BASE}/audios/sample.wav`
];
const fkbeats = [
  `${SAMPLE_BASE}/FKBeats/sample.wav`
];
const kicks = [];
const claps = [];
const hihats = [];
const beatShuffler = [
  `${SAMPLE_BASE}/audios/sample.wav`
];

function randomPath(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function toUrl(rel) {
  return `${LIST_URL}?get=${encodeURIComponent(rel)}`;
}

export function getBreak() {
  const rel = randomPath(breaks);
  return { rel, url: toUrl(rel) };
}

export function getSFX() {
  const rel = randomPath(sfx);
  return { rel, url: toUrl(rel) };
}

export function getFill() {
  const rel = randomPath(fills);
  return { rel, url: toUrl(rel) };
}

export function getPad() {
  const rel = randomPath(pads);
  return { rel, url: toUrl(rel) };
}

export function getBass() {
  const rel = randomPath(bass);
  return { rel, url: toUrl(rel) };
}

export function getBeat() {
  const rel = randomPath(beats);
  return { rel, url: toUrl(rel) };
}

export function getFKBeat() {
  const rel = randomPath(fkbeats);
  return { rel, url: toUrl(rel) };
}

export function getBeatShuffler() {
  const rel = randomPath(beatShuffler);
  return { rel, url: toUrl(rel) };
}

const LIST_URL = `${HOST}/wp-content/themes/thrive-nouveau/list.php`;

// Maps each app array to the on-disk directory (relative to the theme root)
// that list.php reports back. First matching directory wins.
const FOLDER_RULES = [
  ['breaks', ['breaks']],
  ['sfx', ['SFX', 'sfx']],
  ['fills', ['drumfills', 'drumFills', 'fills']],
  ['pads', ['samples/pads', 'pads']],
  ['bass', ['bass']],
  ['beats', ['audios', 'Beats', 'beats']],
  ['fkbeats', ['FKBeats', 'fkbeats']],
  ['kicks', ['Kick', 'Kicks', 'kicks']],
  ['claps', ['Clap', 'Claps', 'claps']],
  ['hihats', ['HiHat', 'HiHats', 'hihats', 'hihat']]
];

const registry = { breaks, sfx, fills, pads, bass, beats, fkbeats, kicks, claps, hihats };

function normDir(name) {
  return String(name).toLowerCase().replace(/\\/g, '/');
}

function pickDir(samples, candidates) {
  const keys = Object.keys(samples);
  for (const name of candidates) {
    const hit = keys.find((k) => normDir(k) === normDir(name));
    const list = hit ? samples[hit] : null;
    if (Array.isArray(list) && list.length) return list;
  }
  return null;
}

/**
 * Fetch the live sample lists from the host's list.php and swap them into the
 * arrays. Runs fire-and-forget: if the host is unreachable or the endpoint is
 * missing, the placeholder lists stay in place so the buttons still work.
 */
export async function loadSampleDirs() {
  try {
    const res = await fetch(LIST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`list.php ${res.status}`);
    const data = await res.json();
    if (!data || typeof data.samples !== 'object') return;
    FOLDER_RULES.forEach(([key, candidates]) => {
      const list = pickDir(data.samples, candidates);
      const target = registry[key];
      if (!list || !target) return;
      target.length = 0;
      list.forEach((rel) => target.push(rel));
      if (key === 'beats') {
        beatShuffler.length = 0;
        list.forEach((rel) => beatShuffler.push(rel));
      }
    });
  } catch (e) {
    // ignore — keep the bundled placeholder lists
  }
}

export { breaks, sfx, fills, pads, bass, beats, fkbeats, kicks, claps, hihats, beatShuffler };
