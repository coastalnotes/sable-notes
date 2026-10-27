import { describe, expect, it } from "vitest";
import { parseBackupJson, parseImportedMarkdown } from "./export";
import type { Note } from "./types";

const note: Note = {
  id: "note-1",
  title: "Example",
  body: "# Example\n\n#tag\n",
  tags: ["tag"],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

describe("parseImportedMarkdown", () => {
  it("uses YAML front matter title and drops the front matter block", () => {
    const md = '---\ntitle: "Imported Title"\ntags: ["x"]\n---\n\n# Heading\n\nBody\n';
    expect(parseImportedMarkdown("ignored.md", md)).toEqual({
      title: "Imported Title",
      body: "# Heading\n\nBody\n",
    });
  });

  it("falls back to a readable filename", () => {
    expect(parseImportedMarkdown("my-cool_note.md", "Body only")).toEqual({
      title: "my cool note",
      body: "Body only\n",
    });
  });

  it("trims trailing whitespace from the body", () => {
    expect(parseImportedMarkdown("x.md", "hello\n\n\n").body).toBe("hello\n");
  });
});

describe("parseBackupJson", () => {
  it("accepts an array payload", () => {
    expect(parseBackupJson(JSON.stringify([note]))).toEqual([note]);
  });

  it("accepts a versioned { notes } payload", () => {
    const json = JSON.stringify({ version: 1, exportedAt: "2026-01-01T00:00:00.000Z", notes: [note] });
    expect(parseBackupJson(json)).toEqual([note]);
  });

  it("regenerates tags and fills defaults for partial notes", () => {
    const [parsed] = parseBackupJson(JSON.stringify({ notes: [{ body: "hello #fresh", title: "" }] }));
    expect(parsed.id).toMatch(/^imported-/);
    expect(parsed.title).toBe("Imported note");
    expect(parsed.tags).toEqual(["fresh"]);
    expect(typeof parsed.createdAt).toBe("number");
  });

  it("rejects payloads without a notes array", () => {
    expect(() => parseBackupJson('{"version":1}')).toThrow(/no notes array/i);
  });
});
