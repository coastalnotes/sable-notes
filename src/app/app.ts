import type { createBearEditor, FormatAction } from "../lib/editor";
import { exportBackupJson, exportNoteMarkdown, parseBackupJson, parseImportedMarkdown } from "../lib/export";
import { ext } from "../lib/extension";
import {
  clearDirectoryHandle,
  downloadVaultZip,
  getSavedDirectoryHandle,
  isFileSystemAccessSupported,
  pickVaultDirectory,
  syncAllNotesToDirectory,
  verifyDirectoryPermission,
  writeNoteToDirectory,
} from "../lib/filesystem";
import { NoteGraphCanvas } from "../lib/graph";
import { buildTagTree, extractTags, extractTitle, type TagNode } from "../lib/markdown";
import {
  bulkPutNotes,
  createNote,
  deleteNote,
  ensureSeed,
  getNote,
  getSettings,
  listAllTags,
  listNotes,
  notesWithTag,
  resolveWikiTitle,
  SETTINGS_KEY,
  saveSettings,
  searchNotes,
  updateNote,
  watchNotes,
} from "../lib/storage";
import { applyTheme, watchSystemTheme } from "../lib/theme";
import type { AppSettings, Note, ThemePref } from "../lib/types";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function excerpt(body: string, len = 140): string {
  // Strip only a leading YAML front-matter block, not any later `---` rule.
  const withoutFrontMatter = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  return withoutFrontMatter.replace(/\s+/g, " ").trim().slice(0, len);
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export class App {
  private notes: Note[] = [];
  private activeId: string | null = null;
  private selectedTag: string | null = null;
  private query = "";
  private theme: ThemePref = "system";
  private saveTimer: number | null = null;
  private editor: ReturnType<typeof createBearEditor> | null = null;
  private suppressEditorChange = false;
  /** Ignores the notes live-query echo of our own writes for a short window. */
  private suppressLiveUntil = 0;
  /** Guards against interleaved async editor mounts when notes change quickly. */
  private renderToken = 0;
  private editorModule: Promise<typeof import("../lib/editor")> | null = null;

  private vaultHandle: FileSystemDirectoryHandle | null = null;
  private autoSyncFolder = true;
  private showNoteMapInHeader = true;
  private graphCanvas: NoteGraphCanvas | null = null;

  constructor(
    private root: HTMLElement,
    private tagList: HTMLElement,
    private notesList: HTMLElement,
    private editorHost: HTMLElement,
    private titleInput: HTMLInputElement,
    private searchInput: HTMLInputElement,
    private status: HTMLElement,
  ) {}

  async init(): Promise<void> {
    await ensureSeed();
    const settings = await getSettings();
    this.theme = settings.theme;
    this.selectedTag = settings.selectedTag ?? null;
    this.activeId = settings.lastOpenNoteId ?? null;
    this.autoSyncFolder = settings.autoSyncFolder ?? true;
    this.showNoteMapInHeader = settings.showNoteMapInHeader ?? true;

    applyTheme(this.theme);
    watchSystemTheme(() => this.theme);

    await this.initVault();
    this.updateMapButtonVisibility();

    // Deep links from the side panel / notifications: app/index.html#<noteId>
    await this.applyHashLink(true);

    this.wireStorageEvents();
    this.bindUI();
    await this.refreshNotes(true);
    this.watchForExternalChanges();
    this.applyResponsive();
    window.addEventListener("resize", () => this.applyResponsive());
    window.addEventListener("hashchange", () => void this.handleHashChange());
  }

  /** Reads `#<noteId>` and activates that note. Returns true when applied. */
  private async applyHashLink(clearFilters = false): Promise<boolean> {
    const raw = location.hash.replace(/^#/, "").trim();
    if (!raw) return false;
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      /* keep raw */
    }
    const note = await getNote(id).catch(() => undefined);
    if (!note) return false;
    this.activeId = note.id;
    if (clearFilters) {
      this.selectedTag = null;
      this.query = "";
      this.searchInput.value = "";
    }
    await saveSettings({
      lastOpenNoteId: note.id,
      ...(clearFilters ? { selectedTag: null } : {}),
    });
    return true;
  }

  private async handleHashChange(): Promise<void> {
    if (!(await this.applyHashLink(true))) return;
    await this.refreshNotes(true);
    this.root.classList.remove("show-list");
  }

  /** Keep the address bar in sync so notes are deep-linkable and shareable. */
  private syncHash(id: string | null): void {
    const desired = id ? `#${encodeURIComponent(id)}` : location.pathname + location.search;
    if (location.hash === desired || (!id && !location.hash)) return;
    history.replaceState(null, "", desired);
  }

  /** React to theme/settings changes from the popup, side panel, or another tab. */
  private wireStorageEvents(): void {
    try {
      ext?.storage?.onChanged?.addListener((changes, area) => {
        if (area !== "local") return;
        const next = changes[SETTINGS_KEY]?.newValue as AppSettings | undefined;
        if (!next?.theme || next.theme === this.theme) return;
        this.theme = next.theme;
        applyTheme(next.theme);
      });
    } catch {
      /* extension APIs unavailable (vite dev / plain tab) */
    }
  }

  /** Refresh list + tags when another surface writes notes (popup, side panel). */
  private watchForExternalChanges(): void {
    watchNotes(() => {
      if (Date.now() < this.suppressLiveUntil) return;
      void this.refreshNotes(false);
    });
  }

  /** Marks the next ~800ms of live-query notifications as our own write. */
  private beginLocalWrite(): void {
    this.suppressLiveUntil = Date.now() + 800;
  }

  private updateMapButtonVisibility(): void {
    const btnMap = document.getElementById("btn-map");
    if (btnMap) {
      btnMap.style.display = this.showNoteMapInHeader ? "" : "none";
    }
  }

  private async initVault(): Promise<void> {
    if (!isFileSystemAccessSupported) return;
    try {
      const handle = await getSavedDirectoryHandle();
      if (handle) {
        const hasPermission = await verifyDirectoryPermission(handle, true);
        if (hasPermission) {
          this.vaultHandle = handle;
          this.updateVaultUI();
        }
      }
    } catch (e) {
      console.warn("Vault initialization notice:", e);
    }
  }

  private updateVaultUI(): void {
    const statusEl = document.getElementById("vault-status");
    const syncNowBtn = document.getElementById("btn-sync-vault-now");
    const disconnectBtn = document.getElementById("btn-disconnect-vault");
    const autoSyncRow = document.getElementById("auto-sync-row");
    const autoSyncChk = document.getElementById("chk-auto-sync") as HTMLInputElement | null;

    if (this.vaultHandle) {
      if (statusEl) {
        statusEl.className = "vault-status active";
        statusEl.textContent = `✓ Connected folder: "${this.vaultHandle.name}"`;
      }
      if (syncNowBtn) syncNowBtn.style.display = "";
      if (disconnectBtn) disconnectBtn.style.display = "";
      if (autoSyncRow) autoSyncRow.style.display = "";
      if (autoSyncChk) autoSyncChk.checked = this.autoSyncFolder;
    } else {
      if (statusEl) {
        statusEl.className = "vault-status";
        statusEl.textContent = isFileSystemAccessSupported
          ? "No local folder connected."
          : "Local Folder Sync requires Chromium (Chrome/Edge/Brave). Use the zip backup below on Firefox.";
      }
      if (syncNowBtn) syncNowBtn.style.display = "none";
      if (disconnectBtn) disconnectBtn.style.display = "none";
      if (autoSyncRow) autoSyncRow.style.display = "none";
    }
  }

  private async pickVault(): Promise<void> {
    try {
      const handle = await pickVaultDirectory();
      if (handle) {
        this.vaultHandle = handle;
        this.updateVaultUI();
        // Sync existing notes to newly connected folder
        const { count } = await syncAllNotesToDirectory(handle, this.notes);
        this.setStatus(`Synced ${count} notes to ${handle.name}`);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.warn("Folder selection cancelled or failed:", e);
      }
    }
  }

  private async syncAllVault(): Promise<void> {
    if (!this.vaultHandle) return;
    this.setStatus("Syncing vault…");
    try {
      const { count } = await syncAllNotesToDirectory(this.vaultHandle, this.notes);
      this.setStatus(`Synced ${count} notes to "${this.vaultHandle.name}" ✓`);
    } catch (e) {
      console.warn("Sync failed:", e);
      this.setStatus("Sync failed — re-select folder");
    }
  }

  private async disconnectVault(): Promise<void> {
    await clearDirectoryHandle();
    this.vaultHandle = null;
    this.updateVaultUI();
    this.setStatus("Disconnected local folder");
  }

  private async syncNoteToVault(note: Note): Promise<void> {
    if (!this.vaultHandle || !this.autoSyncFolder) return;
    try {
      await writeNoteToDirectory(this.vaultHandle, note);
    } catch (e) {
      console.warn("Auto-sync to vault failed:", e);
    }
  }

  private bindUI(): void {
    document.getElementById("btn-new")?.addEventListener("click", () => void this.newNote());
    document.getElementById("btn-delete")?.addEventListener("click", () => void this.deleteActive());
    document.getElementById("btn-export-md")?.addEventListener("click", () => this.exportActive());
    document.getElementById("btn-export-all")?.addEventListener("click", () => void this.exportAll());
    document.getElementById("btn-theme")?.addEventListener("click", () => void this.cycleTheme());
    document
      .getElementById("btn-back")
      ?.addEventListener("click", () => this.root.classList.add("show-list"));

    // Settings Modal
    document.getElementById("btn-settings")?.addEventListener("click", () => this.openSettings());
    document.getElementById("btn-close-settings")?.addEventListener("click", () => this.closeSettings());
    document.getElementById("settings-modal")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this.closeSettings();
    });
    document.getElementById("btn-pick-vault")?.addEventListener("click", () => void this.pickVault());
    document.getElementById("btn-sync-vault-now")?.addEventListener("click", () => void this.syncAllVault());
    document
      .getElementById("btn-disconnect-vault")
      ?.addEventListener("click", () => void this.disconnectVault());
    document
      .getElementById("btn-download-vault-zip")
      ?.addEventListener("click", () => downloadVaultZip(this.notes));
    document
      .getElementById("btn-settings-export-json")
      ?.addEventListener("click", () => void this.exportAll());

    const autoSyncChk = document.getElementById("chk-auto-sync") as HTMLInputElement | null;
    autoSyncChk?.addEventListener("change", () => {
      this.autoSyncFolder = autoSyncChk.checked;
      void saveSettings({ autoSyncFolder: this.autoSyncFolder });
    });

    const showMapChk = document.getElementById("chk-show-map-btn") as HTMLInputElement | null;
    if (showMapChk) showMapChk.checked = this.showNoteMapInHeader;
    showMapChk?.addEventListener("change", () => {
      this.showNoteMapInHeader = showMapChk.checked;
      this.updateMapButtonVisibility();
      void saveSettings({ showNoteMapInHeader: this.showNoteMapInHeader });
    });

    document.getElementById("btn-theme-light")?.addEventListener("click", () => void this.setTheme("light"));
    document.getElementById("btn-theme-dark")?.addEventListener("click", () => void this.setTheme("dark"));
    document
      .getElementById("btn-theme-system")
      ?.addEventListener("click", () => void this.setTheme("system"));
    document.getElementById("btn-open-map-from-settings")?.addEventListener("click", () => {
      this.closeSettings();
      this.openGraphView();
    });

    // Note Map (Graph View)
    document.getElementById("btn-map")?.addEventListener("click", () => this.openGraphView());
    document.getElementById("btn-close-graph")?.addEventListener("click", () => this.closeGraphView());
    document.getElementById("graph-search")?.addEventListener("input", (e) => {
      this.graphCanvas?.setFilter((e.target as HTMLInputElement).value);
    });

    // Formatting Toolbar
    document.querySelectorAll<HTMLButtonElement>("#editor-toolbar .fmt-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const fmt = btn.dataset.fmt as FormatAction | undefined;
        if (fmt && this.editor) {
          this.editor.format(fmt);
        }
      });
    });

    const fileInput = document.getElementById("file-import") as HTMLInputElement | null;
    document.getElementById("btn-import")?.addEventListener("click", () => fileInput?.click());
    document.getElementById("btn-settings-import")?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => {
      if (fileInput.files) void this.importFiles(fileInput.files);
      fileInput.value = "";
    });

    this.searchInput.addEventListener("input", () => {
      this.query = this.searchInput.value;
      void this.refreshNotes(false);
    });

    this.titleInput.addEventListener("input", () => this.scheduleSave());

    document.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void this.newNote();
      } else if (mod && e.key.toLowerCase() === "b") {
        if (this.editor && document.activeElement && this.editorHost.contains(document.activeElement)) {
          e.preventDefault();
          this.editor.format("bold");
        }
      } else if (mod && e.key.toLowerCase() === "i") {
        if (this.editor && document.activeElement && this.editorHost.contains(document.activeElement)) {
          e.preventDefault();
          this.editor.format("italic");
        }
      } else if (e.key === "Escape") {
        this.closeSettings();
        this.closeGraphView();
      }
    });
  }

  private openSettings(): void {
    const modal = document.getElementById("settings-modal");
    if (!modal) return;
    modal.style.display = "flex";
    this.updateVaultUI();
    const storageInfo = document.getElementById("storage-info");
    if (storageInfo) {
      storageInfo.textContent = `${this.notes.length} notes in library.`;
    }
  }

  private closeSettings(): void {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.style.display = "none";
  }

  private openGraphView(): void {
    const overlay = document.getElementById("graph-overlay");
    const container = document.getElementById("graph-canvas-container");
    if (!overlay || !container) return;

    overlay.style.display = "flex";
    if (!this.graphCanvas) {
      this.graphCanvas = new NoteGraphCanvas(container, {
        onSelectNote: (noteId) => {
          this.closeGraphView();
          void (async () => {
            this.activeId = noteId;
            await saveSettings({ lastOpenNoteId: noteId });
            await this.refreshNotes(true, noteId);
          })();
        },
      });
    }

    this.graphCanvas.setNotes(this.notes);

    const searchInput = document.getElementById("graph-search") as HTMLInputElement | null;
    if (searchInput) {
      searchInput.value = "";
      this.graphCanvas.setFilter("");
    }

    const meta = document.getElementById("graph-meta");
    if (meta) {
      let linkCount = 0;
      for (const n of this.notes) {
        const matches = n.body.match(/\[\[[^\][|]+(?:\|[^\]]+)?\]\]/g);
        if (matches) linkCount += matches.length;
      }
      meta.textContent = `${this.notes.length} notes · ${linkCount} connections`;
    }
  }

  private closeGraphView(): void {
    const overlay = document.getElementById("graph-overlay");
    if (overlay) overlay.style.display = "none";
  }

  private async setTheme(theme: ThemePref): Promise<void> {
    this.theme = theme;
    applyTheme(theme);
    await saveSettings({ theme });
    this.setStatus(`Theme: ${theme}`);
  }

  private async newNote(): Promise<void> {
    this.beginLocalWrite();
    const note = await createNote("", "");
    await saveSettings({ lastOpenNoteId: note.id });
    await this.refreshNotes(true, note.id);
    this.titleInput.focus();
    this.titleInput.select();
  }

  private async deleteActive(): Promise<void> {
    if (!this.activeId) return;
    const note = await getNote(this.activeId);
    if (!note) return;
    if (!window.confirm(`Delete "${note.title}"?`)) return;
    this.beginLocalWrite();
    await deleteNote(this.activeId);
    this.activeId = null;
    await saveSettings({ lastOpenNoteId: undefined });
    await this.refreshNotes(true);
  }

  private exportActive(): void {
    const note = this.notes.find((n) => n.id === this.activeId);
    if (note) exportNoteMarkdown(note);
  }

  private async exportAll(): Promise<void> {
    exportBackupJson(await listNotes());
  }

  private async cycleTheme(): Promise<void> {
    this.theme = this.theme === "light" ? "dark" : this.theme === "dark" ? "system" : "light";
    await this.setTheme(this.theme);
  }

  private async importFiles(files: FileList): Promise<void> {
    const imported: Note[] = [];
    for (const f of Array.from(files)) {
      const text = await f.text();
      try {
        if (f.name.endsWith(".json")) {
          imported.push(...parseBackupJson(text));
        } else {
          const { title, body } = parseImportedMarkdown(f.name, text);
          const now = Date.now();
          imported.push({
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
            title,
            body,
            tags: extractTags(body),
            createdAt: now,
            updatedAt: now,
          });
        }
      } catch (e) {
        console.warn("Import failed for", f.name, e);
      }
    }
    if (imported.length > 0) {
      this.beginLocalWrite();
      await bulkPutNotes(imported);
      await this.refreshNotes(true, imported[0]?.id);
      this.setStatus(`Imported ${imported.length} note(s)`);
    }
  }

  private async refreshNotes(rebuildEditor: boolean, forceActiveId?: string): Promise<void> {
    if (this.query) {
      this.notes = await searchNotes(this.query);
    } else if (this.selectedTag) {
      this.notes = await notesWithTag(this.selectedTag);
    } else {
      this.notes = await listNotes();
    }

    if (forceActiveId) this.activeId = forceActiveId;
    else if (this.activeId && !this.notes.some((n) => n.id === this.activeId)) {
      this.activeId = this.notes[0]?.id ?? null;
    } else if (!this.activeId && this.notes.length > 0) {
      this.activeId = this.notes[0].id;
    }

    this.renderTags();
    this.renderList();
    await this.renderActive(rebuildEditor);
  }

  private renderTags(): void {
    void listAllTags().then((tags) => {
      const tree = buildTagTree(tags);
      const html: string[] = [];
      const allActive = this.selectedTag === null ? " active" : "";
      html.push(
        `<button class="tag-row${allActive}" data-tag="">` +
          `<span class="hash">#</span><span>All Notes</span>` +
          `<span class="count">${this.notes.length}</span>` +
          `</button>`,
      );

      const render = (nodes: TagNode[], depth: number) => {
        for (const n of nodes) {
          const active = this.selectedTag === n.full ? " active" : "";
          html.push(
            `<button class="tag-row${active}" data-tag="${esc(n.full)}">` +
              `<span class="hash">#</span><span>${esc(n.segment)}</span>` +
              `<span class="count">${n.count}</span>` +
              `</button>`,
          );
          if (n.children.length > 0) {
            html.push(`<div class="tag-children">`);
            render(n.children, depth + 1);
            html.push(`</div>`);
          }
        }
      };
      render(tree, 0);
      this.tagList.innerHTML = html.join("");
      this.tagList.querySelectorAll<HTMLButtonElement>("[data-tag]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const t = btn.dataset.tag || "";
          this.selectedTag = t === "" ? null : t;
          void saveSettings({ selectedTag: this.selectedTag });
          void this.refreshNotes(false);
          this.root.classList.add("show-list");
        });
      });
    });
  }

  private renderList(): void {
    if (this.notes.length === 0) {
      this.notesList.innerHTML = `<div class="empty">No notes yet.<br/>Press <b>+ New note</b> to start writing.</div>`;
      return;
    }
    this.notesList.innerHTML = this.notes
      .map((n) => {
        const active = n.id === this.activeId ? " active" : "";
        const pills = n.tags
          .slice(0, 3)
          .map((t) => `<span class="pill">#${esc(t)}</span>`)
          .join("");
        return (
          `<button class="note-card${active}" data-id="${esc(n.id)}">` +
          `<h3>${esc(n.title || "Untitled")}</h3>` +
          `<p>${esc(excerpt(n.body)) || "<i>Empty note</i>"}</p>` +
          `<div class="meta"><span>${esc(fmtDate(n.updatedAt))}</span>${pills}</div>` +
          `</button>`
        );
      })
      .join("");
    this.notesList.querySelectorAll<HTMLButtonElement>("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeId = btn.dataset.id ?? null;
        void saveSettings({ lastOpenNoteId: this.activeId ?? undefined });
        this.renderList();
        void this.renderActive(true);
        this.root.classList.remove("show-list");
      });
    });
  }

  private async loadEditorModule(): Promise<typeof import("../lib/editor")> {
    this.editorModule ??= import("../lib/editor");
    return this.editorModule;
  }

  private async renderActive(rebuildEditor: boolean): Promise<void> {
    const token = ++this.renderToken;
    const note = this.notes.find((n) => n.id === this.activeId) ?? null;
    if (!note) {
      this.titleInput.value = "";
      this.titleInput.disabled = true;
      this.editor?.destroy();
      this.editor = null;
      this.editorHost.innerHTML = `<div class="empty">Select or create a note to start writing.</div>`;
      this.syncHash(null);
      return;
    }
    this.titleInput.disabled = false;
    if (document.activeElement !== this.titleInput) this.titleInput.value = note.title;

    if (rebuildEditor || !this.editor) {
      const { createBearEditor } = await this.loadEditorModule();
      if (token !== this.renderToken) return;
      this.editorHost.innerHTML = "";
      this.editor?.destroy();
      this.suppressEditorChange = true;
      this.editor = createBearEditor(this.editorHost, note.body, {
        onChange: (doc) => {
          if (this.suppressEditorChange) return;
          void this.onBodyChange(doc);
        },
        onWikiOpen: (target) => void this.openWiki(target),
        getTitles: () => this.notes.map((n) => n.title),
      });
      this.suppressEditorChange = false;
    } else {
      const focused = this.editorHost.contains(document.activeElement);
      const current = this.editor.view.state.doc.toString();
      if (!(focused && current !== note.body)) {
        this.suppressEditorChange = true;
        this.editor.setDoc(note.body);
        this.suppressEditorChange = false;
      }
    }
    this.syncHash(note.id);
    this.setStatus(`Updated ${fmtDate(note.updatedAt)}`);
  }

  private async onBodyChange(doc: string): Promise<void> {
    if (!this.activeId) return;
    this.setStatus("Saving…");
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    const id = this.activeId;
    this.saveTimer = window.setTimeout(() => {
      void (async () => {
        const titleFromBody = extractTitle(doc);
        const currentTitle = this.titleInput.value.trim();
        const nextTitle =
          (!currentTitle || currentTitle === "Untitled") && titleFromBody ? titleFromBody : currentTitle;
        this.beginLocalWrite();
        const updated = await updateNote(id, { body: doc, title: nextTitle });
        if (updated) {
          const i = this.notes.findIndex((n) => n.id === id);
          if (i >= 0) this.notes[i] = updated;
          if (document.activeElement !== this.titleInput && nextTitle !== this.titleInput.value) {
            this.titleInput.value = updated.title;
          }
          this.setStatus(`Saved ${fmtDate(updated.updatedAt)}`);
          this.renderTags();
          this.renderList();
          void this.syncNoteToVault(updated);
        }
      })();
    }, 450);
  }

  private scheduleSave(): void {
    if (!this.activeId) return;
    this.setStatus("Saving…");
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    const id = this.activeId;
    const title = this.titleInput.value;
    this.saveTimer = window.setTimeout(() => {
      void (async () => {
        const body = this.editor?.view.state.doc.toString() ?? (await getNote(id))?.body ?? "";
        this.beginLocalWrite();
        const updated = await updateNote(id, { title, body });
        if (updated) {
          const i = this.notes.findIndex((n) => n.id === id);
          if (i >= 0) this.notes[i] = updated;
          this.setStatus(`Saved ${fmtDate(updated.updatedAt)}`);
          this.renderList();
          void this.syncNoteToVault(updated);
        }
      })();
    }, 450);
  }

  private async openWiki(target: string): Promise<void> {
    const existing = await resolveWikiTitle(target);
    if (existing) {
      this.selectedTag = null;
      this.query = "";
      this.searchInput.value = "";
      await saveSettings({ selectedTag: null, lastOpenNoteId: existing.id });
      await this.refreshNotes(true, existing.id);
      this.root.classList.remove("show-list");
      return;
    }
    if (!window.confirm(`Create note "${target}"?`)) return;
    this.beginLocalWrite();
    const note = await createNote(target, `# ${target}\n\n`);
    await saveSettings({ lastOpenNoteId: note.id });
    await this.refreshNotes(true, note.id);
    this.root.classList.remove("show-list");
  }

  private setStatus(s: string): void {
    this.status.textContent = s;
  }

  private applyResponsive(): void {
    const back = document.getElementById("btn-back") as HTMLButtonElement | null;
    const narrow = window.innerWidth <= 900;
    if (back) back.style.display = narrow ? "" : "none";
    if (!narrow) this.root.classList.remove("show-list");
    else if (!this.activeId) this.root.classList.add("show-list");
  }
}
