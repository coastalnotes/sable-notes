import Dexie, { liveQuery, type Table } from "dexie";
import { storageGet, storageSet } from "./extension";
import { extractTags, extractTitle } from "./markdown";
import type { AppSettings, Note } from "./types";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

class NotesDB extends Dexie {
  notes!: Table<Note, string>;

  constructor() {
    super("SableNotesDB");
    this.version(1).stores({
      // Indexed fields: updatedAt for sort, title for search prefix.
      notes: "id, title, updatedAt, createdAt",
    });
  }
}

export const db = new NotesDB();

export const SETTINGS_KEY = "sable-settings-v1";
export const LEGACY_SETTINGS_KEY = "bear-settings-v1";

const defaultSettings: AppSettings = {
  theme: "system",
  selectedTag: null,
  autoSyncFolder: true,
  showNoteMapInHeader: true,
};

export async function getSettings(): Promise<AppSettings> {
  // Settings live in extension storage (shared across app/popup/side panel)
  // with a localStorage mirror for the vite dev server.
  try {
    const fromExtension = await storageGet<AppSettings>([SETTINGS_KEY, LEGACY_SETTINGS_KEY]);
    const value = fromExtension[SETTINGS_KEY] ?? fromExtension[LEGACY_SETTINGS_KEY];
    if (value) return { ...defaultSettings, ...value };
  } catch {
    /* ignore */
  }
  try {
    const rawLocal = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (rawLocal) return { ...defaultSettings, ...JSON.parse(rawLocal) };
  } catch {
    /* ignore */
  }
  return { ...defaultSettings };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  try {
    await storageSet({ [SETTINGS_KEY]: next, [LEGACY_SETTINGS_KEY]: next });
  } catch {
    /* ignore — e.g. page opened outside an extension context */
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function buildNote(title: string, body: string): Note {
  const now = Date.now();
  const resolvedTitle = title.trim() || extractTitle(body) || "Untitled";
  return {
    id: uid(),
    title: resolvedTitle,
    body,
    tags: extractTags(body),
    createdAt: now,
    updatedAt: now,
  };
}

export async function createNote(title: string, body: string): Promise<Note> {
  const note = buildNote(title, body);
  await db.notes.put(note);
  return note;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "body">>,
): Promise<Note | undefined> {
  const existing = await db.notes.get(id);
  if (!existing) return undefined;
  const body = patch.body ?? existing.body;
  const next: Note = {
    ...existing,
    title: (patch.title ?? existing.title).trim() || extractTitle(body) || "Untitled",
    body,
    tags: extractTags(body),
    updatedAt: Date.now(),
  };
  await db.notes.put(next);
  return next;
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
}

export async function getNote(id: string): Promise<Note | undefined> {
  return db.notes.get(id);
}

export async function listNotes(): Promise<Note[]> {
  return db.notes.orderBy("updatedAt").reverse().toArray();
}

export async function searchNotes(query: string): Promise<Note[]> {
  const q = query.trim().toLowerCase();
  if (!q) return listNotes();
  const all = await listNotes();
  return all.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export async function listAllTags(): Promise<{ tag: string; count: number }[]> {
  const notes = await db.notes.toArray();
  const counts = new Map<string, number>();
  for (const n of notes) {
    for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

export async function notesWithTag(tag: string): Promise<Note[]> {
  const all = await listNotes();
  return all.filter((n) => n.tags.includes(tag));
}

export async function resolveWikiTitle(title: string): Promise<Note | undefined> {
  const t = title.trim().toLowerCase();
  if (!t) return undefined;
  const all = await db.notes.toArray();
  return all.find((n) => n.title.trim().toLowerCase() === t);
}

/** Seed a welcome note on first run so the UI is never empty (with legacy migration). */
export async function ensureSeed(): Promise<void> {
  const count = await db.notes.count();
  if (count > 0) return;

  // Check if legacy BearNotesDB exists and migrate notes
  try {
    const legacyExists = await Dexie.exists("BearNotesDB");
    if (legacyExists) {
      const legacyDb = new Dexie("BearNotesDB");
      legacyDb.version(1).stores({ notes: "id, title, updatedAt, createdAt" });
      const legacyNotes = await legacyDb.table<Note, string>("notes").toArray();
      if (legacyNotes.length > 0) {
        await db.notes.bulkPut(legacyNotes);
        return;
      }
    }
  } catch {
    /* ignore migration error, proceed to seed */
  }

  const body = [
    "# Welcome to Sable Notes 🐾",
    "",
    "This is a **local-first** Markdown editor. Your notes stay right inside this browser, with optional local directory sync for Obsidian vaults.",
    "",
    "## Try it",
    "",
    "- **Format easily**: Use the formatting toolbar above or type Markdown (`**bold**`, `*italic*`, `# heading`).",
    "- **Tags**: Organize with `#getting-started` or nested `#project/alpha`. Watch the sidebar update.",
    "- **Wiki-links**: Connect notes with [[Second note]] — click to jump.",
    "- **Note Map**: Open the Note Map in Settings ⚙ to explore your connected graph.",
    "- **Local folder sync**: Connect any folder on your computer in Settings ⚙ (Obsidian-compatible).",
    "",
    "#getting-started",
    "",
  ].join("\n");
  const first = await createNote("Welcome to Sable Notes", body);
  await createNote(
    "Second note",
    [
      "# Second note",
      "",
      "This note is linked from [[Welcome to Sable Notes]].",
      "",
      "#getting-started",
    ].join("\n"),
  );
  await saveSettings({ lastOpenNoteId: first.id });
}

export async function bulkPutNotes(notes: Note[]): Promise<void> {
  await db.notes.bulkPut(notes);
}

export async function clearAllNotes(): Promise<void> {
  await db.notes.clear();
}

/**
 * Notify when notes change in any extension page (or browser tab) on this
 * origin. Dexie's liveQuery uses BroadcastChannel, so a quick capture in the
 * popup or side panel updates an already-open app tab without a reload.
 * Returns an unsubscribe function.
 */
export function watchNotes(onChange: () => void): () => void {
  const subscription = liveQuery(() => db.notes.toArray()).subscribe({
    next: () => onChange(),
    error: () => undefined,
  });
  return () => subscription.unsubscribe();
}
