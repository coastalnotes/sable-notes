# Store listing notes

Draft copy and reviewer notes for the Chrome Web Store and Firefox Add-ons
(AMO) listings. Update the versions when the manifest is bumped.

## Basics

- **Name:** Bear Markdown Notes
- **Short description (132 chars max):** Local-first Markdown notes with Bear-style hidden markup, `#nested/tags`, `[[wiki-links]]`, and one-click export. No account, no cloud.
- **Category:** Productivity
- **Language:** English
- **Version:** 0.1.0

## Long description

> Bear Markdown Notes is a fast, local-first Markdown notebook for Chrome and
> Firefox.
>
> **Write the way you think.** Markdown syntax fades out of the way as soon as
> the cursor leaves a line, so headings, bold, and lists read like formatted
> text. Move the cursor back and the raw Markdown returns for editing.
>
> **Organize with tags and links.** Use `#project/alpha` for nested tags in the
> sidebar, and connect notes with `[[Wiki Links]]` that autocomplete and open
> in one click.
>
> **Capture from anywhere.** Quick-capture text from the toolbar popup, the
> side panel, or the selection context menu.
>
> **Your data stays yours.** Notes live in your browser's IndexedDB. There are
> no accounts, no sync servers, no analytics, and no network requests. Export a
> single note as Obsidian-compatible Markdown with YAML front matter, or export
> a complete JSON backup at any time.
>
> **At home in light or dark.** Follows your system theme by default.

## Permission justifications (Chrome Web Store)

| Permission | Why it is needed |
| --- | --- |
| `storage` | Save preferences (theme, last note, selected tag) and the short-lived pending capture from the context menu. |
| `sidePanel` | Open quick capture in Chrome's side panel. |
| `contextMenus` | Add "Capture selection to Bear Notes" and "Open Bear Notes" to the right-click menu. |
| `alarms` | Reserved for scheduled housekeeping; no background network activity. |

`host_permissions` is intentionally empty. The extension requests no access to
web pages and makes no network requests.

## Reviewer test steps

1. Open the extension popup, type `# Hello #idea`, press **Save note**.
2. Open the full app ("Open full app →"), confirm the note appears.
3. Create a note titled `Second`, then type `[[Second]]` in another note and
   click the link to jump between them.
4. Use the sidebar tag `#idea` to filter, then **Export .md** and **Export
   backup JSON** to verify downloads.
5. Switch theme with the ◐ button and confirm light/dark/system cycles.

## Assets still needed (owner action)

- Screenshots: 1280×800 (Chrome) and 1200×800 (Firefox) showing the three-pane
  app, tag sidebar, and quick capture.
- Small promo tile 440×280 (Chrome).
- A publicly hosted privacy policy URL (the text is in `PRIVACY.md`; Chrome and
  AMO require a reachable URL, not a file in the package).
- Confirm the Firefox add-on id in `src/manifest.firefox.json`
  (`bear-markdown-notes@example.com` is a placeholder).
