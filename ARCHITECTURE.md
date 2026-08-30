# Freestyle King — Architecture

Freestyle King is a browser-based freestyle rap training tool. This document
describes the **new JavaScript frontend**, which lives at the repository root.
The legacy PHP reference implementation remains at `page-main5.php` (unchanged,
gitignored so it is not published) at the repository root.

---

## 1. What the application does

- Generates random words/concepts across many categories (compound words,
  common words, adjectives, adverbs, verbs, celebrities, athletes, movies,
  emotions, flavors, questions, and vowel-rhyme sound banks).
- Plays audio samples (beats, drum loops, pads, bass, SFX, fills, auto-beats)
  loaded from the **existing** FreestyleKing WordPress/cPanel infrastructure.
- Provides live microphone input and recording.
- Looks up rhymes / sounds-like / synonyms via the Datamuse API from the
  currently displayed word.
- Displays random quotes via the Forismatic API, with Twitter sharing.
- An "AutoRap" mode cycles through words on a timer while showing the
  relationship view (opened from the Rhymes / Sounds like / Synonyms relationship buttons).

---

## 2. High-level architecture

```
GitHub
   │
   ▼
JavaScript Freestyle King frontend  (Vite + ES modules)
   ├── index.html                  (UI markup)
   ├── src/styles/main.css         (styling)
   ├── src/main.js                 (entry point)
   ├── src/app.js                  (application controller / UI wiring)
   ├── src/data/*.js               (extracted data libraries, ES modules)
   └── src/services/
       ├── api.js                  (Datamuse + Forismatic clients)
       ├── samples.js              (sample list + URL construction)
       └── audio.js                (Tone.js engine: player, sampler, mic, recorder)
              │
              ▼
    EXISTING WORDPRESS REST API  (unchanged, still the sample backend)
              │
              ▼
       EXISTING cPanel sample infrastructure  (unchanged)
```

The **WordPress REST API is NOT being replaced** during this project. There is
**no new PHP backend**. The frontend talks to the same Datamuse, Forismatic, and
freestylekingapp.com sample infrastructure as the legacy page.

---

## 3. Project structure

```
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── .github/workflows/deploy.yml   # Build + publish dist/ to GitHub Pages
├── src/
│   ├── main.js            # Entry: imports CSS + boots the app
│   ├── app.js             # Controller: event wiring, word randomizers, modals
│   ├── styles/
│   │   └── main.css       # All CSS extracted from page-main5.php
│   ├── data/              # Extracted data libraries (as ES modules)
│   │   ├── index.js       # Aggregates/exports all data libraries
│   │   ├── items.js       # (words-compound.js) compound words
│   │   ├── words-compound.js
│   │   ├── words-common.js    # words1 (flattened: 11,438 words)
│   │   ├── words-adjectives.js
│   │   ├── words-adverbs.js
│   │   ├── words-verbs.js
│   │   ├── celebs.js
│   │   ├── athletes.js
│   │   ├── movies.js
│   │   ├── emotions.js
│   │   ├── flavors.js
│   │   ├── questions.js
│   │   ├── rhymes-A.js
│   │   ├── rhymes-ah.js
│   │   ├── rhymes-E.js
│   │   ├── rhymes-eh.js
│   │   ├── rhymes-I.js
│   │   ├── rhymes-ih.js
│   │   ├── rhymes-O.js
│   │   ├── rhymes-owh.js
│   │   ├── rhymes-U.js
│   │   └── rhymes-uh.js
│   └── services/
│       ├── api.js         # Datamuse (ml/sl/rel_rhy) + Forismatic quotes
│       ├── samples.js     # Sample path arrays + URL building
│       └── audio.js       # Tone.js: player, sampler, mic, recorder
└── dist/                  # Production build output (gitignored)
```

---

## 4. Data libraries

All embedded data was extracted from `page-main5.php` into `src/data/` as ES
modules (`const X = [...]; export default X;`). Values, ordering, and nested
structure are preserved exactly.

### `words1` (words-common.js) — flattened array

The legacy code built `words1` with a structural quirk:

```js
words1 = ["the", "of", ...];          // ~786 base words
words1.push(["boat", "noble", ...]);  // 10 push() calls, each a sub-array
```

The `push([...])` calls each pushed a **sub-array as a single element**, so the
original `words1` was nested with length 796 (786 strings + 10 sub-arrays).
Because `rollCommon()` selects a random top-level element, it would occasionally
(~1.3%) dump an entire ~1000-word sub-array as a comma-joined string.

We **flattened** `words1` into a single flat array of **11,438 words** so Random
Word always returns one clean word. No words were lost. The original nested
structure is preserved as comments inside `words-common.js` for reference:

```js
const words1 = [ "the", "of", ... /* 11,438 flat words */ ];
// ... original 10 push([...]) calls preserved as comments ...
export default words1;
```

### Element counts

| Library | Count | Notes |
|---|---|---|
| words1 | 11,438 | flattened (see above) |
| items | 846 | compound words |
| adjectives | 1,115 | |
| movies | 250 | |
| adverbs | 548 | |
| celebs | 289 | |
| emotions | 444 | |
| athletes | 100 | |
| verbs | 330 | |
| A | 210 | |
| ah | 88 | |
| E | 65 | |
| eh | 48 | |
| I | 37 | |
| ih | 78 | |
| O | 35 | |
| U | 20 | |
| uh | 95 | |
| owh | 35 | |
| flavors | 81 | includes several empty-string entries (preserved) |
| questions | 18 | |

---

## 5. Services

### `services/api.js`
- `getSynonyms(word)` → `GET api.datamuse.com/words?ml=`
- `getSoundsLike(word)` → `GET api.datamuse.com/words?sl=`
- `getRhymes(word)` → `GET api.datamuse.com/words?rel_rhy=`
- `getForismaticQuote()` → Forismatic JSONP quote

These reproduce `$.getJSON` calls from the legacy page using `fetch` (and a
JSONP shim for Forismatic).

### `services/samples.js`
In the legacy app, PHP `scandir()` emitted relative paths into global arrays
beat/noun; JavaScript prepended `https://freestylekingapp.com/`. This service
defines the same relative-path arrays (editable locally to stay in sync with
the server theme directories) and exposes getters (`getBreak`, `getPad`,
`getBass`, `getSFX`, `getFill`, `getBeat`, `getFKBeat`, `getBeatShuffler`) that
return `{ rel, url }` where `url = HOST + rel.substr(1)`.

**Important:** Because there is no PHP to run `scandir()` in a pure-static
frontend, and no existing REST endpoint lists these files, the sample path
lists are maintained in `samples.js`. This keeps the identical URL construction
with the existing WordPress/cPanel infrastructure without changing the API
contract or moving any sample files. To refresh the lists, edit the arrays
in `samples.js` to match the server's theme subdirectories.

### `services/audio.js`
Initializes Tone.js:
- `player` (`Tone.Player`) — beats/breaks/fkbeats/custom URLs, looped.
- `sampler` (`Tone.Sampler`) — pads/bass/SFX/fills mapped to C4 via
  `sampler.add("C4", url, false)`.
- `mic` (`Tone.UserMedia`) + `micFFT`.
- `recorder` (`MediaRecorder` on a MediaStreamDestination that mixes
  player + mic + sampler).

Returns the engine handles for the app controller.

---

## 6. Application controller (`app.js`)

- Imports all data libraries from `data/index.js`.
- Defines every word randomizer (`roll`, `rollCommon`, `rollAdj`, ...,
  `randomA`...`randomowh`) using the `random_item()` helper, each of which
  sets `#result` and calls `UpdateWords()`.
- `UpdateWords()` calls Datamuse for synonyms, sounds-like, and rhymes from the
  current word and populates the relationship view (opened from the Rhymes / Sounds like / Synonyms relationship buttons). Clicking a result
  word calls `other2()` to re-target.
- Quote system (`getNewQuote`, Random Quote, Share via Twitter).
- Modal open/close wiring (quote, rhymes, sounds-like, synonyms).
- Playback rate / volume sliders bound to `player`.
- Sample buttons, mic toggle, record/stop/delete, custom URL submission.
- AutoRap (`autorap1`, `autorapverbs`, `autorapadv`, `autorapadj`) and
  auto-beat shuffler.

---

## 7. External dependencies

Bundled via npm:
- `tone` (Tone.js) — npm package.
- `vite` — dev server + build.

Loaded from CDN in `index.html`:
- Bootstrap 4.5.3 (CSS only).
- Web Components polyfill.
- Material Icons (font).

Removed relative to the legacy page:
- Vue 3 (was mounted but effectively unused beyond a `--` message).
- jQuery (replaced with `fetch` / DOM APIs).
- `tone-ui.js` / `components.js` (Tone.js example UI) — the piano and custom
  `<tone-*>` elements they provide were replaced with native buttons/samplers.

---

## 8. Behavior parity notes

- The four `window.onclick` handlers in the legacy file were overwritten in
  sequence so only the last was effective; the new code wires each modal's
  close span directly (the effective behavior).
- Duplicate function definitions in the legacy file (stub `randomX()` then real
  `randomX()`) collapse to the real implementations here.
- `kicks`, `claps`, `hihats` arrays are declared in `samples.js` and reserved
  for upcoming features (populated by the legacy PHP scan).

---

## Auto Wrap word source (the black "X")

The Rap-view word grid buttons carry a tiny black subscript **X** on Auto Wrap
and on every eligible single-word bucket: **Compound Word, Random Word,
Adjective, Adverb, Verbs, Emotions, Flavors**. The X means "this is an
eligible Auto Wrap source". Celebrity, Athlete and Movie intentionally do NOT get
an X because they are proper-noun lists, not single words that make sense to feed
the word API.

Behavior: whichever X-marked bucket you last pressed is **queued** as the word
source for the next Auto Wrap, so Auto Wrap draws from the most recent bucket
instead of a fixed one. It defaults to Random Word (Words 1) until another
eligible bucket is pressed. The queue lives in app.js (autorapQueue /
queueAutorapSource), autorap1() opens Auto Wrap with the queued bucket, and
autorap's advance() keeps drawing from that same bucket for every tick (never a
hardcoded fallback).
