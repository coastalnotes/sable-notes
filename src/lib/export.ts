import { extractTags, slugifyTitle } from "./markdown";
import type { Note } from "./types";

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function frontMatter(note: Note): string {
  const tags = note.tags.map((t) => `"${t.replace(/"/g, "")}"`).join(", ");
  const iso = (ts: number) => new Date(ts).toISOString();
  return `---\ntitle: "${note.title.replace(/"/g, "'")}"\ncreated: ${iso(note.createdAt)}\nupdated: ${iso(note.updatedAt)}\ntags: [${tags}]\n---\n\n`;
}

export function formatNoteMarkdown(note: Note): string {
  return `${frontMatter(note)}${note.body.replace(/\s+$/, "")}\n`;
}

/** Export a single note as Obsidian-friendly `.md` (YAML front matter + raw body). */
export function exportNoteMarkdown(note: Note): void {
  const md = formatNoteMarkdown(note);
  download(new Blob([md], { type: "text/markdown" }), `${slugifyTitle(note.title)}.md`);
}

function parseFrontMatterTitle(text: string): { title?: string; rest: string } {
  if (!text.startsWith("---")) return { rest: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { rest: text };
  const fm = text.slice(3, end);
  const rest = text.slice(end + 4).replace(/^\n/, "");
  const m = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return { title: m?.[1]?.trim(), rest };
}

/** Parse an imported `.md` file into a note. */
export function parseImportedMarkdown(filename: string, text: string): { title: string; body: string } {
  const { title, rest } = parseFrontMatterTitle(text);
  const fallback = filename.replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim() || "Imported note";
  return { title: title || fallback, body: `${rest.trim()}\n` };
}

/** Bulk JSON backup: { version, exportedAt, notes }. */
export function exportBackupJson(notes: Note[]): void {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), notes }, null, 2);
  download(new Blob([payload], { type: "application/json" }), `sable-notes-backup-${yyyymmdd()}.json`);
}

export function parseBackupJson(text: string): Note[] {
  const data = JSON.parse(text) as { notes?: Note[] } | Note[];
  const arr = Array.isArray(data) ? data : data.notes;
  if (!Array.isArray(arr)) throw new Error("Backup JSON has no notes array");
  return arr.map((n, i) => {
    if (!n || typeof n !== "object") throw new Error(`Invalid note at index ${i}`);
    const rec = n as Partial<Note>;
    const body = typeof rec.body === "string" ? rec.body : "";
    return {
      id: typeof rec.id === "string" ? rec.id : `imported-${Date.now()}-${i}`,
      title: typeof rec.title === "string" && rec.title ? rec.title : "Imported note",
      body,
      tags: Array.isArray(rec.tags) ? rec.tags.map(String) : extractTags(body),
      createdAt: typeof rec.createdAt === "number" ? rec.createdAt : Date.now(),
      updatedAt: typeof rec.updatedAt === "number" ? rec.updatedAt : Date.now(),
    } satisfies Note;
  });
}

function yyyymmdd(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
