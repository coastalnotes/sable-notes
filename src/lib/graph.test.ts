import { describe, expect, it } from "vitest";
import { buildGraphData } from "./graph";
import type { Note } from "./types";

describe("buildGraphData", () => {
  it("builds nodes and links from wiki-links in notes", () => {
    const notes: Note[] = [
      {
        id: "1",
        title: "Alpha Note",
        body: "Mentions [[Beta Note]] and [[Gamma Note]].",
        tags: ["tag1"],
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: "2",
        title: "Beta Note",
        body: "Mentions [[Alpha Note]] back.",
        tags: [],
        createdAt: 2000,
        updatedAt: 2000,
      },
      {
        id: "3",
        title: "Gamma Note",
        body: "No links here.",
        tags: ["tag2"],
        createdAt: 3000,
        updatedAt: 3000,
      },
    ];

    const data = buildGraphData(notes);
    expect(data.nodes.length).toBe(3);
    // Links: Alpha <-> Beta, Alpha <-> Gamma
    expect(data.links.length).toBe(2);

    const alpha = data.nodes.find((n) => n.id === "1");
    expect(alpha?.degree).toBe(2);
    expect(alpha?.radius).toBeGreaterThan(5);

    const gamma = data.nodes.find((n) => n.id === "3");
    expect(gamma?.degree).toBe(1);
  });

  it("handles case-insensitive wiki-link targets and alias pipes", () => {
    const notes: Note[] = [
      {
        id: "a",
        title: "Project Alpha",
        body: "See [[project beta|Custom Label]].",
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "b",
        title: "Project Beta",
        body: "Target note.",
        tags: [],
        createdAt: 2,
        updatedAt: 2,
      },
    ];

    const data = buildGraphData(notes);
    expect(data.links.length).toBe(1);
    expect(data.links[0].source.id).toBe("a");
    expect(data.links[0].target.id).toBe("b");
  });

  it("ignores self-links and missing target notes gracefully", () => {
    const notes: Note[] = [
      {
        id: "solo",
        title: "Solo Note",
        body: "Linking [[Solo Note]] and [[Ghost Note]].",
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const data = buildGraphData(notes);
    expect(data.nodes.length).toBe(1);
    expect(data.links.length).toBe(0);
    expect(data.nodes[0].degree).toBe(0);
  });
});
