# Privacy Policy — Bear Markdown Notes

Last updated: 2026-10-27

Bear Markdown Notes is a local-first note-taking extension. **Your notes never
leave your device.**

## What the extension stores

- **Notes** are stored in your browser's IndexedDB database (`BearNotesDB`) on
  this device.
- **Preferences** (theme, last open note, selected tag, the id of the app tab)
  are stored in the browser's extension storage (`storage.local`).
- **A pending capture** is stored briefly in `storage.local` when you use the
  "Capture selection to Bear Notes" context menu, and is deleted as soon as the
  popup or side panel reads it.

## What the extension does not do

- No network requests. The extension contains no analytics, telemetry, ads, or
  remote code.
- No accounts, no cloud sync, no third-party services.
- No collection of browsing history. The Firefox build requests the `tabs`
  permission only to focus an already-open notes tab; tab data is never read or
  transmitted.
- No note content, titles, tags, or usage data is sold, shared, or transferred
  to anyone.

## Your control

- **Export** any note as Markdown or export a full JSON backup at any time.
- **Delete** notes individually in the app. Uninstalling the extension removes
  its IndexedDB and extension storage per your browser's policy.

## Contact

Open an issue in the project's source repository for privacy questions.
