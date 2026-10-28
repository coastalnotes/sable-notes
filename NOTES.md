# Project notes / handoff

Last updated: **2026-10-27**
Current project: **Sable Notes v0.1.0**
Version: `0.1.0` · License: MIT · Not yet published to any store.

---

## 1. What this project is

A sleek, local-first Markdown notes extension for **Chrome (MV3)** and
**Firefox (MV3)** built from one codebase. Three surfaces share one IndexedDB
database:

| Surface | Entry | Purpose |
| --- | --- | --- |
| Full app | `src/app/` | Three-pane notes app (tags · list · editor) + Note Map + Settings |
| Popup | `src/popup/` | Quick capture from the toolbar |
| Side panel / sidebar | `src/sidepanel/` | Quick capture + recent notes |
| Background worker | `src/background.ts` | Commands, context menus, tab reuse, side panel |

Notes are stored in IndexedDB (`SableNotesDB` with auto-migration from `BearNotesDB`) via Dexie.
Preferences are in extension storage under `sable-settings-v1`. Optional local directory sync
uses the File System Access API (Chromium) to save `.md` notes directly into any folder or
Obsidian vault. All notes can also be exported as a standard Vault `.zip` on any browser.

---

## 2. Current status

### Working and verified locally

- [x] `npm run typecheck` — clean
- [x] `npm run lint` (Biome) — clean
- [x] `npm test` — 25/25 tests passing
- [x] `npm run build:all` — builds both packages and passes `verify-build.mjs`
- [x] `npm run package:zip` — generates `sable-notes-chrome.zip` & `sable-notes-firefox.zip`
- [x] Formatting taskbar (H1, H2, H3, Bold, Italic, Strikethrough, Code, Task, Bullet, Number, Quote, Wiki-link, Link)
- [x] Settings modal (Local Folder Sync + Vault ZIP export + Note Map options + Themes)
- [x] Interactive Note Map (Graph view with physics simulation, zoom/pan, search filter, click-to-open)
- [x] Backed up to GitHub: `https://github.com/coastalnotes/sable-notes` (CI passing)
- [x] Firefox implementation paused per user instruction (focusing on Chrome Web Store)

### Not verified (needs a real extension install)

- [ ] Loading `dist-chrome` unpacked in Chrome
- [ ] Loading `dist-firefox` via `about:debugging`
- [ ] Tab reuse when the app is already open
- [ ] Context-menu selection capture → pending capture → popup/side panel
- [ ] Theme/settings sync across extension surfaces
- [ ] Side panel opening from keyboard command

---

## 3. Resume commands

```bash
cd "/Users/jwagner/codeproj/Markdown Editor for Browser"

npm install            # only needed on a fresh clone
npm run dev            # http://localhost:5173/app/index.html
npm run dev:chrome     # watch-build into dist-chrome/ (manifest included)
npm run dev:firefox    # watch-build into dist-firefox/
npm run typecheck
npm run lint
npm test
npm run build:all      # clean packages for both browsers + verification
npm run package:zip    # create bear-notes-chrome.zip & bear-notes-firefox.zip
```

Dev server URLs:

- `http://localhost:5173/app/index.html`
- `http://localhost:5173/popup/popup.html`
- `http://localhost:5173/sidepanel/sidepanel.html`

Load builds:

- Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `dist-chrome/`
- Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `dist-firefox/manifest.json`

Toolchain used: Node 26.0.0, npm 11.12.1, Vite 6.4.5, Vitest 5.0.5,
Biome 2.6.3, TypeScript 5.6.

---

## 4. What was fixed in this pass (2026-10-27)

### Build & packaging

- `build:all` referenced a missing `build:firefox:only` script. It now runs
  `build` once, packages both targets, then verifies.
- `scripts/copy-manifest.mjs` now **deletes the target directory first**, so
  renamed hashed chunks can no longer accumulate in `dist-chrome/` /
  `dist-firefox/`.
- Added `scripts/verify-build.mjs`: validates manifest JSON, icons, popup,
  background entry, side panel, HTML asset references, and flags unreferenced
  (stale) assets. Wired into `build:all` and CI.
- Added `dev:firefox`; fixed `dev:chrome` so the manifest is written and the
  build lands directly in `dist-chrome/` (previously it rebuilt `dist/` only
  and never copied).
- `build:chrome` / `build:firefox` now run typecheck via `npm run build`.

### Bugs fixed

- **Deep links were ignored.** The side panel opened
  `app/index.html#<noteId>`, but nothing read the hash. `App.init()` now
  resolves the hash (clearing filters), and `hashchange` re-applies it. The app
  also keeps the hash in sync with the open note via `history.replaceState`.
- **App tab reuse silently failed.** `chrome.tabs.query({ url })` needs the
  `tabs` permission. Chrome now uses `runtime.getContexts()` (no broad
  permission); Firefox remembers the opened tab id in storage and verifies its
  URL. Chrome minimum raised to **116**; Firefox minimum stays **121**.
- **Captures didn't appear in an open app tab.** Added Dexie `liveQuery`
  (`watchNotes()` in `storage.ts`); writes from popup/side panel/tabs refresh
  the list and tags. Own writes are suppressed briefly to avoid redundant
  renders, and the editor is not overwritten while the user is typing.
- **Theme changes didn't propagate.** `chrome.storage.onChanged` now reapplies
  the theme in the full app.
- **Firefox API mismatch.** All `chrome.*`/`browser.*` access goes through
  `src/lib/extension.ts`, which prefers `browser`, normalizes storage to
  promises, and degrades to web APIs in the dev server.
- **Deleted-last-note leak.** The editor is destroyed when no note is active.
- **Excerpt bug.** Only a leading YAML front-matter block is stripped (the old
  regex could cut content at any later `---` rule).
- Removed dead code: `bearDark` theme and the unreachable
  `chrome.action.onClicked` handler.

### Performance

- CodeMirror is **lazy-loaded** with a dynamic `import()` and a render token to
  handle rapid note switching. Initial app JS is ~13 kB; the editor chunk
  (~183 kB gzip) loads only after a note opens.
- Vendor chunks split: `codemirror`, `dexie`, `extension`, `editor`.
  `chunkSizeWarningLimit` is 560 kB with a comment explaining the lazy chunk.

### Quality

- Vitest + 20 tests: `src/lib/markdown.test.ts`, `src/lib/export.test.ts`.
- Biome config (`biome.json`) for lint + format; `npm run lint`,
  `npm run lint:fix`, `npm run format`.
- CI: `.github/workflows/ci.yml` runs install → typecheck → lint → tests →
  `build:all` → uploads both packages.
- A11y: explicit `type="button"`, `aria-label`s on icon buttons, `aria-live`
  status regions, `aria-label` on the editor, visible focus rings,
  `prefers-reduced-motion` handling.
- Dependencies: `npm audit fix` bumped Vite to 6.4.5 / source-map-js to 1.2.2.

### Docs

- `README.md` rewritten (structure, commands, dev URLs, permissions, release
  checklist).
- Added `LICENSE` (MIT), `PRIVACY.md`, `CHANGELOG.md`,
  `docs/store-listing.md` (store copy, permission justifications, reviewer
  steps, asset checklist).
- `.gitignore` now ignores `coverage/` and `*.log` in addition to build output.

---

## 5. Key decisions / tradeoffs to remember

- **No host permissions, no network.** Keep it that way; it is the product's
  core promise and the privacy story.
- **Chrome avoids the `tabs` permission** by using `runtime.getContexts`
  (Chrome 116+). Firefox requests `tabs` only to verify the remembered app tab
  URL; Firefox does not prompt for it.
- **Hash routing is internal, not a router.** The hash stores a note id and is
  updated with `replaceState`; there is no history stack per note.
- **Cross-surface freshness uses Dexie `BroadcastChannel`**, so it works
  because all extension pages share an origin. It is intentionally not a
  polling loop.
- **Settings are read through extension storage first, `localStorage` second.**
  The mirror exists only for `npm run dev`.
- **Deep links depend on stable note ids** (`crypto.randomUUID()`); JSON import
  preserves ids.
- **The editor is single-mounted.** Theme switching does not rebuild it; colors
  come from CSS variables.

---

## 6. Known limitations / possible next work

- No rendered Markdown preview or reading mode (editor only, by design so far).
- Search is an in-memory scan over all notes (`searchNotes`); fine for
  thousands of notes, not for huge libraries.
- `window.confirm()` is still used for delete and wiki-link auto-create.
- `ensureSeed()` can double-seed if two surfaces open at the same instant on a
  brand-new profile (very unlikely, not handled).
- Icons in `src/public/icons/` are small placeholder PNGs; replace with real
  artwork before store submission.
- No note-level encryption, no sync/cloud, no multi-window merge strategy.
- Version is still `0.1.0`; decide whether this pass ships as `0.1.1`.
- MIT copyright line says “Bear Markdown Notes contributors”; change if you
  want your name.
- No git remote is configured, so CI has not run yet.
- Packaging produces directories and zips (`npm run package:zip` creates `bear-notes-chrome.zip` and `bear-notes-firefox.zip`).

---

## 7. Owner checklist (things only you can do)

1. [ ] Load `dist-chrome/` unpacked and `dist-firefox/` temporary, then run the
       extension-only smoke tests listed in §2.
2. [ ] Replace the placeholder Firefox add-on id
       `bear-markdown-notes@example.com` in `src/manifest.firefox.json`.
3. [ ] Confirm the final version number (`0.1.0` or bump).
4. [ ] Decide the MIT copyright holder.
5. [ ] Add a git remote and push so CI runs.
6. [ ] Replace placeholder icons with final artwork.
7. [ ] Capture screenshots (Chrome 1280×800, Firefox 1200×800) and a 440×280
       promo tile.
8. [ ] Host `PRIVACY.md` at a public URL (required by Chrome Web Store / AMO).
9. [ ] Create store listings using `docs/store-listing.md`.
10. [ ] Optionally test on a low-end machine and with a large note library.

---

## 8. Where things live

```
src/
  background.ts              service worker: menus, commands, tab reuse, panel
  manifest.chrome.json       MV3, minimum_chrome_version 116
  manifest.firefox.json      MV3, gecko id placeholder, tabs permission
  styles.css                 Bear theme + focus/reduced-motion styles
  lib/
    extension.ts             browser/chrome normalization, storage, app URL
    storage.ts               Dexie CRUD/search/tags/settings + watchNotes()
    markdown.ts              #tags, [[wiki-links]], titles, tag tree, slugify
    export.ts                .md/JSON export + import parsers
    editor.ts / editor.css   CodeMirror setup, hidden marks, wiki-links
    theme.ts                 light/dark/system resolution
    types.ts                 Note, AppSettings, ThemePref
    *.test.ts                Vitest suites
  app/                       full-tab app (index.html, main.ts, app.ts)
  popup/                     quick capture popup
  sidepanel/                 side panel/sidebar capture + recent notes
  public/icons/              extension icons (placeholders)
scripts/
  copy-manifest.mjs          clean + package dist/ -> dist-chrome|firefox
  verify-build.mjs           package integrity checks
docs/store-listing.md        store copy + reviewer steps
.github/workflows/ci.yml     CI
```

### Storage keys and identifiers

- IndexedDB: `BearNotesDB`, table `notes` (`id, title, updatedAt, createdAt`)
- Settings: `bear-settings-v1`
- Pending capture: `bear-pending-capture`
- Remembered app tab (Firefox fallback): `bear-app-tab-id`

---

## 9. Release checklist (when ready)

1. Bump version in `package.json` + both manifests; update `CHANGELOG.md`.
2. `npm run typecheck && npm run lint && npm test && npm run build:all`
3. Load both packages and smoke-test (see §7).
4. Zip `dist-chrome/` and `dist-firefox/`.
5. Submit with `docs/store-listing.md`; include the hosted privacy-policy URL.
