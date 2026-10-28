import { describe, expect, it } from "vitest";
import { formatNoteMarkdown } from "./export";
import { buildVaultZipBlob } from "./filesystem";
import type { Note } from "./types";

describe("filesystem & vault zip", () => {
  it("formats markdown with Obsidian-compatible YAML frontmatter", () => {
    const note: Note = {
      id: "test-id",
      title: "My Great Note",
      body: "# My Great Note\n\nContent here.",
      tags: ["work", "ideas"],
      createdAt: 1700000000000,
      updatedAt: 1700000005000,
    };

    const md = formatNoteMarkdown(note);
    expect(md).toContain('title: "My Great Note"');
    expect(md).toContain('tags: ["work", "ideas"]');
    expect(md).toContain("# My Great Note\n\nContent here.");
  });

  it("builds a valid uncompressed zip blob from notes", async () => {
    const notes: Note[] = [
      {
        id: "1",
        title: "Hello World",
        body: "First note.",
        tags: ["intro"],
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: "2",
        title: "Second Note",
        body: "Second note.",
        tags: [],
        createdAt: 2000,
        updatedAt: 2000,
      },
    ];

    const blob = buildVaultZipBlob(notes);
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBeGreaterThan(100);

    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    // Standard ZIP local file header signature 0x04034b50
    expect(view.getUint32(0, true)).toBe(0x04034b50);
  });
});
