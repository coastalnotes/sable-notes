/** Markdown helpers: #tag parsing, [[wiki-link]] parsing, title extraction. */

const TAG_RE = /(^|[\s(>"'])#([A-Za-z0-9][\p{L}\p{N}_/-]*)/gu;
const WIKI_RE = /\[\[([^\][|]+)(?:\|([^\]]+))?\]\]/g;
const FENCED_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]*`/g;

function stripCode(s: string): string {
  return s.replace(FENCED_RE, "").replace(INLINE_CODE_RE, "");
}

/** Extract `#tag` / `#nested/tag` tokens (without the leading #). */
export function extractTags(body: string): string[] {
  const clean = stripCode(body);
  const out = new Set<string>();
  for (const match of clean.matchAll(TAG_RE)) {
    let tag = match[2].replace(/[/_-]+$/g, "").replace(/^\/+/, "");
    if (!tag) continue;
    // Drop trailing punctuation captured by loose char class edge cases.
    tag = tag.replace(/[.,;:!?)]+$/g, "");
    if (tag) out.add(tag);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** Build sidebar tree: { segment, full, count, children } from flat tag list. */
export interface TagNode {
  segment: string;
  full: string;
  count: number;
  children: TagNode[];
}

export function buildTagTree(tags: { tag: string; count: number }[]): TagNode[] {
  const root: TagNode[] = [];
  for (const { tag, count } of tags) {
    const parts = tag.split("/").filter(Boolean);
    let level = root;
    let full = "";
    for (const part of parts) {
      full = full ? `${full}/${part}` : part;
      let node = level.find((n) => n.segment === part);
      if (!node) {
        node = { segment: part, full, count: 0, children: [] };
        level.push(node);
      }
      node.count += count;
      level = node.children;
    }
  }
  const sortRec = (nodes: TagNode[]) => {
    nodes.sort((a, b) => a.segment.localeCompare(b.segment));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(root);
  return root;
}

export interface WikiLink {
  raw: string;
  target: string;
  alias?: string;
  index: number;
}

/** Parse all [[Target]] / [[Target|Alias]] links in a body. */
export function extractWikiLinks(body: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const match of body.matchAll(WIKI_RE)) {
    out.push({
      raw: match[0],
      target: match[1].trim(),
      alias: match[2]?.trim(),
      index: match.index ?? 0,
    });
  }
  return out;
}

/** First `# heading` in the doc, else first non-empty line (truncated). */
export function extractTitle(body: string): string {
  for (const line of body.split("\n")) {
    const h = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (h?.[1]) return h[1].trim().slice(0, 120);
  }
  for (const line of body.split("\n")) {
    const t = line
      .trim()
      .replace(/^[-*+]\s+/, "")
      .replace(/^>\s*/, "");
    if (t) return t.slice(0, 120);
  }
  return "";
}

/** Slugify a title for `.md` file export. */
export function slugifyTitle(title: string): string {
  const s = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "untitled";
}
