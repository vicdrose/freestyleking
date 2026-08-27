# Freestyle King — Migration / Refactoring Plan

This document tracks the **actual** migration of Freestyle King from the legacy
monolithic PHP page (`page-main5.php`) to the new JavaScript frontend
(which lives at the repository root).

> Status marker: `[x]` = done, `[ ]` = pending / in progress.

---

## Goal

Separate the frontend from the legacy PHP page while preserving functionality,
without replacing the WordPress REST API or building a new backend.

```
page-main5.php  (legacy reference, kept for comparison)
      │
      ▼
JavaScript Freestyle King  (repo root)
      │
      ▼
        localhost (Vite dev, port 5174)
      │
      ▼
        browser
      │
      ▼
   existing WordPress REST API + samples (freestylekingapp.com)
```

---

## Phase 1 — Audit (COMPLETE)

The legacy file was fully analyzed. Results (data libraries, PHP scandir sample
generation, functions, event handlers, external resources, API interactions,
modals, UI) are captured in `ARCHITECTURE.md`.

Key findings:
- ~180 KB of 207 KB total is embedded data across 21 arrays.
- WordPress PHP only does: template declaration + `scandir()` directory scans
  that emit `<script>` tags pushing sample paths into JS globals.
- The only APIs used: Datamuse (`ml`, `sl`, `rel_rhy`) and Forismatic (quotes),
  plus a Twitter share URL.
- `words1` used a nested array structure in the original (786 base words + 10
  pushed sub-arrays = 11,438 total); it has since been flattened (see below).
- Data count corrections vs. the earlier draft audit: `emotions` = 444 (not
  446), `items` = 846 (not 847). Extraction is taken directly from source lines
  so these reflect the actual file.

---

## Phase 2 & 3 — New project + migration (COMPLETE)

- [x] Vite project scaffold (`package.json`, `vite.config.js`, `index.html`).
- [x] `src/` module layout (app / styles / data / services).
- [x] All CSS extracted into `src/styles/main.css`.
- [x] HTML UI recreated in `index.html`.
- [x] Audio engine (player, sampler, mic, recorder) in `services/audio.js`.
- [x] API clients (Datamuse + Forismatic) in `services/api.js`.
- [x] Sample service (URL construction to freestylekingapp.com) in
      `services/samples.js`.
- [x] Word randomizers, modals, quotes, AutoRap, beat shuffler wired in
      `src/app.js`.
- [x] Entry point `src/main.js`.

---

## Phase 4 — Data library extraction (COMPLETE)

All 21 libraries extracted into `src/data/*.js` ES modules, exact values and
ordering preserved. See `ARCHITECTURE.md` §4 for the full inventory.

- [x] Rhyme banks (`A ah E eh I ih O U uh owh`) → `rhymes-*.js`
- [x] `items` → `words-compound.js`
- [x] `words1` (flattened; original nested structure kept as comments) →
      `words-common.js`
- [x] `adjectives` / `adverbs` / `verbs` → `words-*.js`
- [x] `celebs` / `movies` / `emotions` / `flavors` / `questions` / `athletes`

---

## Phase 5 — Local development (COMPLETE)

- [x] `npm install`
- [x] `npm run dev` → serves on **http://localhost:5174** (port 5174 chosen so
      it does not collide with `delivery-sim` on 5173 or `beat-brainstorm` on
      8123).
- [x] `npm run build` → production build to `dist/`.
- [x] Verified data modules load with expected counts (words1 = 11,438 total,
      etc.).

To run locally:

```bash
npm install        # once
npm run dev        # http://localhost:5174
```

Hot reload is enabled (Vite), so edits are reflected on refresh.

---

## Phase 6 — Legacy file (COMPLETE)

- [x] `page-main5.php` is **not deleted**; kept as the behavioral reference.

---

## Phase 7 — Documentation

- [x] `ARCHITECTURE.md` — describes the new architecture.
- [x] This `REFACTORING-PLAN.md` — documents the migration and remaining work.

---

## Remaining work / follow-ups

- [ ] **Sample file lists**: `services/samples.js` currently holds placeholder
      one-entry arrays because the legacy PHP `scandir()` is unavailable in a
      static frontend and no REST endpoint lists the files. These arrays should
      be populated with the real relative paths from the server's theme
      subdirectories (`breaks`, `SFX`, `drumfills`, `samples/pads`, `bass`,
      `audios`, `FKBeats`, `Kick`, `Clap`, `HiHat`) to restore full sample
      variety. This does not change the API — only the list contents.
- [x] **`words1` normalization** — the nested structure was flattened to a
      single array of 11,438 words so Random Word always returns one clean
      word (the original occasionally dumped a ~1000-word sub-array string).
      Original nested structure preserved as comments in `words-common.js`.
- [x] **GitHub + GitHub Pages** — repo `vicdrose/FreestyleKing` (public); the
      legacy `vicdrose/FreestyleKing-Unity` repo (a separate Unity project) was
      renamed aside. `page-main5.php` is gitignored (not published). A
      GitHub Actions workflow builds and deploys `dist/` to Pages on push to
      `main` → **https://vicdrose.github.io/FreestyleKing**.
- [ ] **Tone.js UI components** — the original used `tone-ui.js` /
      `components.js` for a Tone.js piano and custom `<tone-*>` elements. These
      were replaced with native controls; verify the sampling/piano experience
      meets expectations or re-add those components.
- [ ] **Avatar/Account, Premium, Standard, Suggestions, Translations buttons**
      are present in the UI but non-functional in the source (no-op /
      strikethrough) — preserved as non-functional to match the original.
- [ ] **Forismatic JSONP** — implemented via a JSONP shim; verify it works in
      the target browser (some environments block it).

---

## Manual testing checklist (requires a browser)

1. Start dev server (`npm run dev`), open http://localhost:5174.
2. Click every random word button — result appears in `#result`.
3. Click every vowel button — a vowel-rhyme word appears.
4. Click Rhymes / Sounds like / Synonyms — modal opens and populated via
   Datamuse; click a result word to retarget.
5. Play a CLASSICS / FK Beats / DRUM LOOP beat; adjust rate and volume sliders.
6. Load a PAD / BASS / SFX / Drum Fill sample.
7. Test custom URL submission.
8. Test mic toggle, record → start beat → stop → playback, delete.
9. Test autorap and autobeats.
10. Test quote modal (Random Quote + Share).
