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

export function createBearEditor(
  parent: HTMLElement,
  initialDoc: string,
  cb: EditorCallbacks,
): { view: EditorView; setDoc(doc: string): void; destroy(): void } {
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
    destroy() {
      view.destroy();
    },
  };
}
