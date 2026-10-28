import { autocompletion, type CompletionContext, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Bear-style "hide marks" behavior:
 * - CodeMirror tags raw syntax with `.cm-formatting*` classes.
 * - CSS (editor.css) hides those marks everywhere EXCEPT the line with
 *   the cursor (`cm-activeLineHide` decoration added below).
 */
const activeLineMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) this.decorations = this.build(u.view);
    }
    build(view: EditorView) {
      const { head } = view.state.selection.main;
      const line = view.state.doc.lineAt(head);
      return Decoration.set([Decoration.line({ class: "cm-activeLineHide" }).range(line.from)]);
    }
  },
  { decorations: (v) => v.decorations },
);

/** Wiki-link highlight: underline [[Target]] spans (except on active line, where raw text shows). */
const wikiMark = Decoration.mark({ class: "cm-wikilink" });

function wikiDeco(view: EditorView): DecorationSet {
  const ranges: ReturnType<Decoration["range"]>[] = [];
  const text = view.state.doc.toString();
  const re = /\[\[([^\][|]+)(?:\|([^\]]+))?\]\]/g;
  for (const match of text.matchAll(re)) {
    if (match.index == null) continue;
    ranges.push(wikiMark.range(match.index, match.index + match[0].length));
  }
  return Decoration.set(ranges, true);
}

const wikiPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = wikiDeco(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = wikiDeco(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

export interface EditorCallbacks {
  onChange(doc: string): void;
  onWikiOpen(target: string): void;
  getTitles(): string[];
}

function wikiCompletions(cb: EditorCallbacks) {
  return async (ctx: CompletionContext) => {
    const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 60), ctx.pos);
    const m = before.match(/\[\[([^\][|]*)$/);
    if (!m) return null;
    const titles = cb.getTitles();
    return {
      from: ctx.pos - m[1].length,
      options: titles
        .filter((t) => t.toLowerCase().includes(m[1].toLowerCase()))
        .slice(0, 20)
        .map((label) => ({ label, type: "link", apply: `${label}]]` })),
    };
  };
}

/**
 * Single theme for both light and dark: colors come from CSS custom properties
 * that flip with `[data-theme]`, so the editor never needs to be rebuilt when
 * the user switches themes.
 */
export const bearTheme = EditorView.theme({
  "&": { backgroundColor: "var(--bg-editor)", color: "var(--fg)" },
  ".cm-content": {
    fontFamily: "var(--font-stack)",
    fontSize: "16px",
    lineHeight: "1.7",
    maxWidth: "720px",
    margin: "0 auto",
    padding: "48px 32px 120px",
    caretColor: "var(--accent)",
  },
  ".cm-line": { padding: "0 4px" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selection) !important",
  },
});

export type FormatAction =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "h1"
  | "h2"
  | "h3"
  | "task"
  | "bullet"
  | "number"
  | "quote"
  | "wikilink"
  | "link";

export function applyFormat(view: EditorView, action: FormatAction): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const selectedText = state.sliceDoc(from, to);

  if (action === "bold") {
    if (from !== to) {
      view.dispatch({
        changes: { from, to, insert: `**${selectedText}**` },
        selection: { anchor: from + 2, head: to + 2 },
      });
    } else {
      view.dispatch({
        changes: { from, insert: "****" },
        selection: { anchor: from + 2 },
      });
    }
  } else if (action === "italic") {
    if (from !== to) {
      view.dispatch({
        changes: { from, to, insert: `*${selectedText}*` },
        selection: { anchor: from + 1, head: to + 1 },
      });
    } else {
      view.dispatch({
        changes: { from, insert: "**" },
        selection: { anchor: from + 1 },
      });
    }
  } else if (action === "strike") {
    if (from !== to) {
      view.dispatch({
        changes: { from, to, insert: `~~${selectedText}~~` },
        selection: { anchor: from + 2, head: to + 2 },
      });
    } else {
      view.dispatch({
        changes: { from, insert: "~~~~" },
        selection: { anchor: from + 2 },
      });
    }
  } else if (action === "code") {
    if (from !== to) {
      view.dispatch({
        changes: { from, to, insert: `\`${selectedText}\`` },
        selection: { anchor: from + 1, head: to + 1 },
      });
    } else {
      view.dispatch({
        changes: { from, insert: "``" },
        selection: { anchor: from + 1 },
      });
    }
  } else if (action === "wikilink") {
    if (from !== to) {
      view.dispatch({
        changes: { from, to, insert: `[[${selectedText}]]` },
        selection: { anchor: from + 2, head: to + 2 },
      });
    } else {
      view.dispatch({
        changes: { from, insert: "[[Note title]]" },
        selection: { anchor: from + 2, head: from + 12 },
      });
    }
  } else if (action === "link") {
    if (from !== to) {
      view.dispatch({
        changes: { from, to, insert: `[${selectedText}](https://)` },
        selection: { anchor: to + 3, head: to + 11 },
      });
    } else {
      view.dispatch({
        changes: { from, insert: "[title](https://)" },
        selection: { anchor: from + 1, head: from + 6 },
      });
    }
  } else if (action === "h1" || action === "h2" || action === "h3") {
    const prefix = action === "h1" ? "# " : action === "h2" ? "## " : "### ";
    const line = state.doc.lineAt(from);
    const lineText = line.text;
    const existingHeading = lineText.match(/^(#{1,6}\s+)/);
    if (existingHeading) {
      if (existingHeading[1] === prefix) {
        view.dispatch({
          changes: { from: line.from, to: line.from + existingHeading[1].length, insert: "" },
        });
      } else {
        view.dispatch({
          changes: { from: line.from, to: line.from + existingHeading[1].length, insert: prefix },
        });
      }
    } else {
      view.dispatch({
        changes: { from: line.from, insert: prefix },
      });
    }
  } else if (action === "task") {
    const line = state.doc.lineAt(from);
    const lineText = line.text;
    const match = lineText.match(/^(\s*)-\s+\[[ x]\]\s+/i);
    if (match) {
      view.dispatch({
        changes: { from: line.from, to: line.from + match[0].length, insert: match[1] },
      });
    } else {
      view.dispatch({
        changes: { from: line.from, insert: "- [ ] " },
      });
    }
  } else if (action === "bullet") {
    const line = state.doc.lineAt(from);
    const lineText = line.text;
    const match = lineText.match(/^(\s*)-\s+/);
    if (match) {
      view.dispatch({
        changes: { from: line.from, to: line.from + match[0].length, insert: match[1] },
      });
    } else {
      view.dispatch({
        changes: { from: line.from, insert: "- " },
      });
    }
  } else if (action === "number") {
    const line = state.doc.lineAt(from);
    const lineText = line.text;
    const match = lineText.match(/^(\s*)\d+\.\s+/);
    if (match) {
      view.dispatch({
        changes: { from: line.from, to: line.from + match[0].length, insert: match[1] },
      });
    } else {
      view.dispatch({
        changes: { from: line.from, insert: "1. " },
      });
    }
  } else if (action === "quote") {
    const line = state.doc.lineAt(from);
    const lineText = line.text;
    const match = lineText.match(/^(\s*)>\s+/);
    if (match) {
      view.dispatch({
        changes: { from: line.from, to: line.from + match[0].length, insert: match[1] },
      });
    } else {
      view.dispatch({
        changes: { from: line.from, insert: "> " },
      });
    }
  }

  view.focus();
}

export function createBearEditor(
  parent: HTMLElement,
  initialDoc: string,
  cb: EditorCallbacks,
): { view: EditorView; setDoc(doc: string): void; format(action: FormatAction): void; destroy(): void } {
  const extensions: Extension[] = [
    history(),
    markdown(),
    syntaxHighlighting(defaultHighlightStyle),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: "true", "aria-label": "Note body" }),
    activeLineMarks,
    wikiPlugin,
    autocompletion({ override: [wikiCompletions(cb)] }),
    keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) cb.onChange(u.state.doc.toString());
    }),
    // Cmd/Ctrl-click or plain click on a wiki-link opens the target note.
    EditorView.domEventHandlers({
      click: (ev, view) => {
        if (!(ev.metaKey || ev.ctrlKey || (ev.target as HTMLElement)?.closest?.(".cm-wikilink"))) {
          return false;
        }
        const pos = view.posAtCoords({ x: ev.clientX, y: ev.clientY });
        if (pos == null) return false;
        const line = view.state.doc.lineAt(pos);
        const text = view.state.sliceDoc(line.from, line.to);
        const re = /\[\[([^\][|]+)(?:\|[^\]]+)?\]\]/g;
        for (const match of text.matchAll(re)) {
          if (match.index == null) continue;
          const from = line.from + match.index;
          const to = from + match[0].length;
          if (pos >= from && pos <= to) {
            cb.onWikiOpen(match[1].trim());
            return true;
          }
        }
        return false;
      },
    }),
    bearTheme,
  ];

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: initialDoc, extensions }),
  });

  return {
    view,
    setDoc(doc: string) {
      const cur = view.state.doc.toString();
      if (cur === doc) return;
      view.dispatch({
        changes: { from: 0, to: cur.length, insert: doc },
      });
    },
    format(action: FormatAction) {
      applyFormat(view, action);
    },
    destroy() {
      view.destroy();
    },
  };
}

export const createSableEditor = createBearEditor;
