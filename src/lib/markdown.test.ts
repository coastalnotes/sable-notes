import { describe, expect, it } from "vitest";
import { buildTagTree, extractTags, extractTitle, extractWikiLinks, slugifyTitle } from "./markdown";

describe("extractTags", () => {
  it("finds flat and nested tags", () => {
    expect(extractTags("Ideas for #project and #project/alpha.")).toEqual(["project", "project/alpha"]);
  });

  it("dedupes and sorts tags", () => {
    expect(extractTags("#zeta #alpha #zeta")).toEqual(["alpha", "zeta"]);
  });

  it("ignores tags inside fenced and inline code", () => {
    expect(extractTags("```\n#not-a-tag\n```\nand `#also-not`")).toEqual([]);
  });

  it("supports unicode and strips trailing punctuation", () => {
    expect(extractTags("#café, #naïve!")).toEqual(["café", "naïve"]);
  });

  it("does not treat mid-word hashes as tags", () => {
    expect(extractTags("a#b")).toEqual([]);
  });
});

describe("buildTagTree", () => {
  it("nests segments and rolls up counts", () => {
    const tree = buildTagTree([
      { tag: "project/alpha", count: 1 },
      { tag: "project/beta", count: 2 },
      { tag: "misc", count: 3 },
    ]);

    expect(tree.map((n) => n.segment)).toEqual(["misc", "project"]);
    const project = tree[1];
    expect(project.full).toBe("project");
    expect(project.count).toBe(3);
    expect(project.children.map((n) => [n.segment, n.full, n.count])).toEqual([
      ["alpha", "project/alpha", 1],
      ["beta", "project/beta", 2],
    ]);
  });
});

describe("extractWikiLinks", () => {
  it("parses plain and aliased links with positions", () => {
    const links = extractWikiLinks("See [[Alpha]] and [[Beta|the second]].");
    expect(links.map((l) => l.target)).toEqual(["Alpha", "Beta"]);
    expect(links[1].alias).toBe("the second");
    expect(links[0].index).toBe(4);
  });

  it("ignores malformed brackets", () => {
    expect(extractWikiLinks("[[unclosed and [single]")).toEqual([]);
  });
});

describe("extractTitle", () => {
  it("prefers the first heading", () => {
    expect(extractTitle("intro text\n\n# The Real Title\nbody")).toBe("The Real Title");
  });

  it("skips YAML front matter to reach a heading", () => {
    expect(extractTitle('---\ntitle: "From metadata"\n---\n\n## Body heading')).toBe("Body heading");
  });

  it("falls back to the first non-empty line without list markers", () => {
    expect(extractTitle("\n\n- Just a line\nmore")).toBe("Just a line");
  });

  it("returns an empty string for an empty body", () => {
    expect(extractTitle("   \n\n")).toBe("");
  });
});

describe("slugifyTitle", () => {
  it("produces filesystem-safe lowercase slugs", () => {
    expect(slugifyTitle("Hello, World!")).toBe("hello-world");
    expect(slugifyTitle("Café Notes")).toBe("cafe-notes");
    expect(slugifyTitle("   ")).toBe("untitled");
  });
});
