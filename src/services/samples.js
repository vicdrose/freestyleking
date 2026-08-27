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
  return HOST + rel.substr(1);
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

export { breaks, sfx, fills, pads, bass, beats, fkbeats, kicks, claps, hihats, beatShuffler };
