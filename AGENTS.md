# AGENTS.md

Guidance for AI coding agents working in this repo (OpenCode and others).

## Project
Freestyle King — a rap-free-styling + beat-making PWA ("dojo of rappers": practice rhyming, record raps, 4-pad sampler, Drummer+ beat engine, friends/posts feed). Vanilla JS + Ionic components (no framework build step beyond bundling) + Tone.js for audio. Built with Vite; deployed as a static PWA (GitHub Pages-style, relative `base: './'`).

## Commands (Windows PowerShell; cwd = repo root)
- Dev server: `node node_modules/vite/bin/vite.js --port 5174 --strictPort` (port MUST be 5174 — config `open: true` may also try to open a browser; `npm run dev` works but starts an extra browser tab).
- Build: `node node_modules/vite/bin/vite.js build` → `dist/` (gitignored; do NOT commit). Build output ends with `precache N entries`.
- `git add` only the files you touched; commit message matching repo style (short imperative summary); push to `main` when asked. Auto-deploy ~2 min after push.

## Verify UI with the headless-chrome probe (do this before committing UI changes)
No test framework. The reliable ritual:
1. Write `probe-xxx.mjs` in repo root with a minimal IIFE that appends `<pre id="probe-out">` to `body` and sets `out.textContent` to line-delimited results (no imports).
2. Temporarily insert `<script type="module" src="/probe-xxx.mjs"></script>` immediately after `<script type="module" src="/src/main.js"></script>` in `index.html`.
3. Start vite on 5174 (separate command from the HTTP check — combining `Start-Process` + a web-request in ONE bash call gets the tool killed). Confirm `Invoke-WebRequest http://localhost:5174` returns 200.
4. Dump: `Remove-Item` stale `dv.txt`/`de.txt`; headless Chrome with unique `--user-data-dir` under `C:\Users\MASTER~1\AppData\Local\Temp\opencode\probe*`:
   `"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --no-first-run --disable-extensions --user-data-dir=<ud> --dump-dom --window-size=480,1200 --virtual-time-budget=30000 http://localhost:5174` redirecting stdout→`dv.txt`, stderr→`de.txt`, `-Wait`.
5. Read results from `dv.txt` with regex `<pre id="probe-out">([\s\S]*?)</pre>`.
6. Layout gotchas: elements in non-active `ion-tab`s have zero `getBoundingClientRect` — activate with `document.querySelector('ion-tabs').selected = 'beat'`; `ion-accordion` sections start collapsed — set `acc.expanded = true` and/or click `.beat-acc-header`. Ionic injects its own stylesheet that can beat app CSS (e.g. slotted margins) — inline styles on the element are the reliable override.
7. Cleanup: delete the probe file, remove the script tag from index.html (restore the single `/src/main.js` line), `Remove-Item` the temp `dv.txt`/`de.txt`/probe user-data dir, and kill vite on 5174 (`Get-CimInstance Win32_Process` filter on `node.exe` + `*vite*5174*`, then `Stop-Process`).

## Architecture (src/)
- `main.js` — entry; imports CSS, registers router/init.
- `app.js` — everything UI: tab wiring, menu (`menu-start`, Settings dropdown `settings-menu-item`/`settings-menu-sub`), sections accordion (`beat-acc-row` rows + `chk-beat-*` toggles + reorder drag handles), Drummer+ pane, sync wiring (`initFileSync`, `syncIntoApp`, `refreshSyncStatus`, overlay `syncOverlay`), `wirePlayerPref` (advanced animation checkbox `fk-chk-advanced`), `applyDrummerToUi`, `wipeRackDom`, `unlock`, `showToast`. Large file (~2900 lines) — grep before assuming a symbol's location.
- `drummer.js` — beat engine: `save()` (persists + fires `onSaved` hook), `serialize()`, `applyRack`, `restore()`, `onSaved(cb)`.
- `library.js` — samples library in IndexedDB `fk-library`; `putTrack(rec)` (sets `updatedAt`), `saveTrack`.
- `services/filesync.js` — cross-device storage adapter (seam): modes `folder` (`showDirectoryPicker`, OPFS-backed), `share` (export/import `freestyleking-backup.json`), `legacy`. Folder contract: `tracks.json` + `tracks/<id>.wav`, `racks.json`, `drummer-state.json`, `settings.json`. Merge policy: folder-authoritative on load, last-writer-wins mid-session, imports non-destructive. API: `getMode`, `folderStatus`, `loadHandle`, `connectFolder`, `disconnectFolder`, `setDirHandle(root)` (opaque root — wrapper/test seam), `readDirBundle`, `mergeBundle`, `buildMetaBundle`, `writeMirror`, `writeMirrorBundle`, `exportSingleFile`, `importFiles`. `mirrorState` diffs track meta (`lastTrackSig`) and writes new/changed WAVs immediately.
- `services/audio.js` — Tone.js contexts/players. `feed.js`/`api.js` — community feed backends. `samples.js` — pad sample mapping. `data/` — rhyme/word/emoji decks + `index.js`.
- `index.html` — full UI markup (single page, Ionic; ~900 lines).
- `src/styles/main.css` — dark theme; menu (`.menu-sub` indent), `.beat-acc-row`, `.beat-accordion`, drummer pane styles.

## Key facts new agents should not rediscover
- Ignore `dist/`, `dev-server.log`, `probe-*.mjs` left-behinds. Root docs: `ARCHITECTURE.md`, `REFACTORING-PLAN.md`, `SYNC-SETUP.md` (user-facing sync guide).
- Mobile/desktop is the real platform — the app is tested on Android Chrome (picker works there; `getMode` returns `folder`).
- Important app constants: `FK_ADVANCED_KEY='fkAdvancedPlayer'`, localStorage `fk.drummer.state`, `fk.drummer.racks`, IndexedDB `fk-library`.
- Styling convention: plain CSS in `main.css`; keep rules near their section (create new blocks, don't fight Ionic—use inline styles for overrides that Ionic's shadow CSS wins over).