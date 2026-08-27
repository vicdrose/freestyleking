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
- [x] **GitHub + GitHub Pages** — repo `vicdrose/freestyleking` (public); the
      legacy `vicdrose/FreestyleKing-Unity` repo (a separate Unity project) was
      renamed aside. Repo renamed to all-lowercase `freestyleking` so the Pages
      URL is exactly **https://vicdrose.github.io/freestyleking**. `page-main5.php`
      is gitignored (not published). A GitHub Actions workflow builds and
      deploys `dist/` to Pages on push to `main`.
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

---

## Raps & Beats community feed (rebuilt)

- [x] **Feed tabs restored** — added `Raps` and `Beats` tab-bar buttons and two
      `<ion-tab>` views that render community posts as cards (Play button +
      title + author). Preserves the original homepage repeater look (Beats
      accent `#cf0a2c`, Raps accent `#415f9d`).
- [x] **Future-proof fetcher** — `src/services/feed.js` exposes a single
      `FEED_CONFIG` constant (API base + category slugs/labels/accents). It
      resolves category slug → id via `categories?slug=`, fetches posts with
      `_embed` (author/media), and extracts title/link/author/audio (ACF field,
      embedded media, or audio-URL detection). Swapping backends later is a
      one-config change. Playback uses a simple `playSong(url)` helper (no
      legacy helper existed in `page-main5.php`).
- [x] **Graceful failure** — if the API is unreachable, each feed shows a
      friendly "Couldn't load this feed" message with a **Try again** button.

### TODO — WordPress host is currently DOWN (blocks live feeds)

The WordPress CMS behind `freestylekingapp.com` is **broken** — an error on the
host took down the entire WordPress site/CMS, **not** just the API. The result
is a broken SSL/TLS certificate / trust error, so neither the REST API
(`/wp-json/wp/v2`) nor the sample audio files are reachable from a browser or
this build environment.

- The frontend feed is finished and deployed; it will resolve once the host is
  back. **Do NOT use fake/test data** to fill the feed.
- Next step (likely in a separate OpenCode context, since the user won't do it
  by hand): work on the WordPress side — likely via **FileZilla** (FTP/SFTP) to
  inspect exactly what broke and repair the CMS/cert so the REST API and sample
  audio come back online. After it's fixed, feed cards should populate with
  real posts; no frontend change should be required.

### TODO — WordPress / SSL repair (cross-context; keep safe)

- **Root cause of the HTTPS failure:** the site's **X509 SSL certificate has
  expired** (~4 weeks ago) per DirectAdmin → SSL Certificates ("expired or not
  yet valid"). Renewing/replacing the cert (ACME / auto-renew, or manual upload)
  should restore HTTPS and the `freestylekingapp.com` REST API + sample audio.
- **Hosting:** DirectAdmin Web Control Panel on `Hyperion.hostns.io` (port 2222,
  path `/Evo/`). Files reachable via **FileZilla**.
- **Domain confirmed:** the WordPress site is on **`freestylekingapp.com`** —
  the same domain the feed's `FEED_CONFIG.base` and the sample `HOST` already
  point at, so no code changes are needed in this repo once the cert is fixed.
- **Homepage note:** the live front page uses **Slider Revolution** with the
  "Fashion Big Display" font for "Spit That" (cursive-ish display script, white).
  That look has been mirrored into this repo's Home tab heading (big H1 now reads
  **"Spit That"** in `Alex Brush`/`Dancing Script` cursive, white with a thin
  yellow shadow). Deliberately left the small top-toolbar title as "Freestyle King".
- **Tooling limitation:** this OpenCode instance is bound to the `freestyle-king`
  GitHub repo folder only — it **cannot** simultaneously reach the live WordPress
  site / DirectAdmin / FileZilla files. The WordPress/FileZilla repair should be
  done in a **separate OpenCode instance** pointed at that content (e.g. named
  "Freestyle King WordPress Admin").
