# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `build:all` no longer references a missing script; it now builds and verifies
  both extension packages.
- Packages are cleaned before copying, so stale hashed chunks no longer ship.
- `app/index.html#<noteId>` deep links (used by the side panel's recent notes)
  now activate the requested note.
- Popup/side panel captures appear in an already-open app tab via Dexie
  live queries instead of requiring a reload.
- Theme changes propagate between extension surfaces.
- `openFullApp()` locates an existing app tab without the broad `tabs`
  permission on Chrome (uses `runtime.getContexts`); Firefox remembers the tab
  id and grants `tabs` for URL verification.
- Cross-browser API usage no longer assumes Chrome's callback style.
- Icon-only buttons have accessible names and a visible keyboard focus ring.
- Editor no longer leaks or keeps stale content when the last note is deleted.
- Note excerpts no longer strip content after an unrelated `---` rule.

### Added

- Unit tests for Markdown parsing and import/export (Vitest).
- Biome lint/format configuration and CI workflow.
- Build verification script that fails on missing or stale package files.
- LICENSE, privacy policy, changelog, and store listing notes.
- Vendor chunk splitting for CodeMirror and Dexie.

## [0.1.0] - 2026-09-29

### Added

- Bear-style three-pane Markdown notes app for Chrome and Firefox.
- Hidden-markdown CodeMirror editor, `#nested/tags` sidebar, `[[wiki-links]]`
  with autocomplete, quick capture popup, context menu, and side panel.
- Markdown/JSON export and import, light/dark/system themes, IndexedDB storage.
