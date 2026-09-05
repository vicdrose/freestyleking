# Sync Setup — come back here

Shipped in commit `d10e75f` (auto-deployed after push). This file is the
orientation + to-do list for picking the sync setup back up.

## What exists right now (the short version)

- A storage adapter seam: `src/services/filesync.js` picks the best backend
  automatically.
  - **Folder backend** (desktop Chrome/Edge): you pick/create one folder
    (menu → **Sync** → *Connect folder…*), permission persists after that one
    grant; the app auto-reads on launch and auto-writes on every change.
  - **Export/Import backend** (Android/iOS, where there's no directory
    picker): *Export all as one file…* writes `freestyleking-backup.json`,
    *Import from files…* reads it back. Browser storage stays the live store.
  - **Legacy**: plain localStorage + IndexedDB if neither API exists.
- Folder contract (`freestyleking/` inside the synced folder):
  - `tracks.json` — track metadata
  - `tracks/<id>.wav` — saved freestyles
  - `racks.json` — Drummer+ saved racks
  - `drummer-state.json` — the live rack
  - `settings.json` — a few pref keys
- Merge policy: non-destructive. Tracks merge by id/`updatedAt`, racks by
  name/`savedAt`, whole-file JSONs are folder-authoritative on load and
  last-writer-wins in-session. Imports never delete.
- Wiring: `drummer.onSaved()` hook → `filesync.writeMirror()` rides the same
  5s save net and also streams new/changed track WAVs into `tracks/`
  immediately; `writeMirrorBundle()` (full sync, all WAVs) runs once per
  session and on connect. `library.js` gained `putTrack()` so imports can keep
  ids.

Verified 17/17 in headless Chrome against a real `FileSystemDirectoryHandle`
(OPFS): write → second-device pull → backup round-trip → UI smoke test.

## To-do when you come back

- [ ] **Set up the Syncthing side**: a shared folder on your PC, folder name
      `freestyleking` (or whatever you type in the picker). Point Syncthing at
      it. Same folder shared to your phone via Syncthing-Android.
- [ ] **Desktop connect**: open the app → menu → Sync → *Connect folder…* →
      choose/create the folder once. Watch the status line change to "Synced
      to folder".
- [ ] **Make a beat, save a rack, save a track** — then confirm
      `tracks.json`, `racks.json`, `drummer-state.json`, `settings.json` and
      `tracks/<id>.wav` appear in the folder.
- [ ] **Phone pull**: on your phone, either connect the folder (if directory
      access exists there) or *Import from files…* → pick `tracks.json` +
      WAVs from the synced folder. Confirm the track and rack show up.
- [ ] **Round-trip**: change something on the phone, import it on the desktop,
      confirm it appears (and vice versa).
- [ ] **Second browser sanity check**: the folder backend needs a real user
      gesture for the picker (that first grant is the only prompt ever).

## Known trade-offs (decided earlier, revisit if annoying)

- Android/iOS have no silent folder access on the web: the first Connect on
  each device is a mandatory one-time grant; on phones without the API it's
  manual Export/Import rather than invisible sync.
- In-session conflicts resolve last-writer-wins for whole-file JSONs (racks,
  live state, settings); tracks use timestamps. No file-watching yet — the
  pull happens on launch/connect, not mid-session.
- Built wrapper-ready: a Capacitor (native) Android backend can slot into
  `filesync.js` via `setDirHandle()` when we want full auto-sync on phones.