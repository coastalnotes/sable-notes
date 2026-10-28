# 🐾 Sable Notes (Chrome & Firefox)

Sleek, local-first Markdown notes as a cross-browser extension. Obsidian-compatible: `#tags`, `[[wiki-links]]`, formatting taskbar, interactive Note Map, local directory sync, and raw `.md` / ZIP export.

Status, decisions, and the remaining manual checklist: **[NOTES.md](NOTES.md)**.

## Stack

- Manifest V3 (Chrome) + WebExtensions MV3 (Firefox) from one codebase
- Vanilla TypeScript + Vite (zero framework bloat)
- CodeMirror 6 editor with hidden-markdown styling & one-click formatting taskbar
- IndexedDB via Dexie.js (`SableNotesDB`), live cross-page updates via `BroadcastChannel`
- Interactive HTML5 Canvas Note Map (Obsidian-style graph view)
- File System Access API for local folder sync (Obsidian vaults) + universal Vault ZIP export

## Project structure

```
src/
  manifest.chrome.json / manifest.firefox.json
  background.ts            # service worker: commands, context menus, side panel, tab reuse
  styles.css               # Sable theme (light/dark via [data-theme])
  lib/
    types.ts               # Note, AppSettings
    storage.ts             # Dexie CRUD + search + tags + settings + live query
    extension.ts           # chrome.*/browser.* normalization, storage helpers, app URL
    filesystem.ts          # File System Access API + vault directory sync + zip export
    graph.ts               # Interactive canvas Note Map (force-directed graph)
    markdown.ts            # #tag parsing, [[wiki-link]] parsing, titles, tag tree
    export.ts              # .md export, JSON backup, import parsers
    editor.ts / editor.css # CodeMirror setup, hidden marks, wiki-links, formatting
    theme.ts               # light/dark/system
    *.test.ts              # Vitest unit tests
  app/                     # full-tab app (index.html, main.ts, app.ts)
  popup/                   # quick capture (popup.html, popup.ts)
  sidepanel/               # side panel (sidepanel.html, sidepanel.ts)
  public/icons/            # extension icons
scripts/
  copy-manifest.mjs        # clean + package dist/ -> dist-chrome/ or dist-firefox/
  verify-build.mjs         # fails on missing/stale files in either package
docs/store-listing.md      # store copy, permission justifications, reviewer steps
```

## Develop

```bash
npm install
npm run dev        # vite dev server for UI iteration
npm run typecheck  # tsc --noEmit
npm run lint       # biome check (lint + format)
npm test           # vitest unit tests
npm run build      # typecheck + vite build -> dist/
```

The dev server serves the app at:

- `http://localhost:5173/app/index.html` — full app
- `http://localhost:5173/popup/popup.html` — quick capture
- `http://localhost:5173/sidepanel/sidepanel.html` — side panel

Extension APIs are unavailable there; settings fall back to `localStorage` and
cross-page updates work through Dexie's `BroadcastChannel`. For real extension
behavior, use the watch builds:

```bash
npm run dev:chrome    # rebuilds dist-chrome/ on change (manifest included)
npm run dev:firefox   # rebuilds dist-firefox/ on change
```

## Package

```bash
npm run build:chrome    # typecheck + build + clean-package dist-chrome/
npm run build:firefox   # typecheck + build + clean-package dist-firefox/
npm run build:all       # both packages + verification
```

Both package commands clean their output directory first, so renamed chunks
never linger. `verify-build.mjs` checks manifests, icons, entry documents, and
unreferenced assets before the build is considered good.

Chrome: `chrome://extensions` → Developer mode → Load unpacked → `dist-chrome`.
Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist-firefox/manifest.json`.

Chrome requires **116+** (uses `runtime.getContexts` to focus an existing app
tab without the broad `tabs` permission). Firefox requires **121+**.

## Features

- Three-pane layout: tag sidebar (`#tag/nested`), notes list, distraction-free editor
- Inline Markdown hides `**`, `*`, `#` marks off-cursor; shows on active line
- `[[Note Title]]` links: autocomplete, click/Meta-click to open, auto-create prompt
- Deep links: `app/index.html#<noteId>`; the address bar tracks the open note
- Quick capture: `Cmd/Ctrl+Shift+M` (side panel), popup, selection context menu
- Live updates: captures from the popup/side panel appear in an open app tab
- Export: single `.md` with YAML front matter, full JSON backup; import `.md`/JSON
- Theme: light / dark / system, follows OS and syncs across extension pages
- Storage: 100% local IndexedDB; no network calls, no lock-in

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Preferences and the short-lived pending capture. |
| `sidePanel` / `sidebar_action` | Quick capture in Chrome's side panel / Firefox's sidebar. |
| `contextMenus` | Selection capture and "Open Bear Notes" menu items. |
| `alarms` | Reserved; no background network activity. |
| `tabs` (Firefox only) | Verify and focus an already-open app tab; no tab data is read or sent. |

No host permissions are requested, and the extension makes no network requests.
See [PRIVACY.md](PRIVACY.md).

## Data model

```ts
interface Note { id: string; title: string; body: string; tags: string[]; createdAt: number; updatedAt: number; }
```

Tags are derived from note bodies on every save (`extractTags`), so Obsidian edits re-import cleanly.

## Release checklist

1. `npm run typecheck && npm run lint && npm test && npm run build:all`
2. Bump `version` in `package.json` and both manifests; update `CHANGELOG.md`.
3. Load each package in its browser and smoke-test save, wiki-link, theme, export.
4. Zip `dist-chrome/` and `dist-firefox/` for submission.
5. Update the listing using [docs/store-listing.md](docs/store-listing.md) and
   host `PRIVACY.md` at a public URL.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests, both builds, and the
package verifier on every push and pull request.

## License

MIT — see [LICENSE](LICENSE).
