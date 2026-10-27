/// <reference types="chrome" />

/**
 * Background service worker (Chrome MV3 module SW / Firefox MV3 scripts).
 * Dependency-free apart from the tiny cross-browser storage helper so the
 * bundle stays a single file.
 */
import { storageGet, storageSet } from "./lib/extension";

const ext = ((globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome) as typeof chrome;

const APP_PAGE = "app/index.html";
const APP_TAB_KEY = "bear-app-tab-id";

function appUrl(): string {
  return ext.runtime.getURL(APP_PAGE);
}

type TabContext = { tabId?: number; documentUrl?: string };

/**
 * Locate an already-open app tab.
 * Chrome 116+ exposes runtime.getContexts so this works without the broad
 * "tabs" permission. Firefox has no getContexts, so we remember the tab id we
 * opened and verify its URL (Firefox grants "tabs" without a prompt).
 */
async function findAppTab(): Promise<number | undefined> {
  const runtime = ext.runtime as typeof chrome.runtime & {
    getContexts?: (filter: { contextTypes: string[] }) => Promise<TabContext[]>;
  };
  const target = appUrl();
  if (typeof runtime.getContexts === "function") {
    try {
      const contexts = await runtime.getContexts({ contextTypes: ["TAB"] });
      const hit = contexts.find((c) => (c.documentUrl ?? "").split("#")[0] === target);
      return hit?.tabId ?? undefined;
    } catch {
      /* fall through to the stored-tab fallback */
    }
  }
  try {
    const stored = await storageGet<number>([APP_TAB_KEY]);
    const id = stored[APP_TAB_KEY];
    if (typeof id !== "number") return undefined;
    const tab = await ext.tabs.get(id);
    if (!tab.url || tab.url.split("#")[0] === target) return id;
  } catch {
    /* tab is gone */
  }
  return undefined;
}

async function openFullApp(): Promise<void> {
  const existing = await findAppTab().catch(() => undefined);
  if (existing != null) {
    try {
      await ext.tabs.update(existing, { active: true });
      const tab = await ext.tabs.get(existing);
      if (tab.windowId != null) await ext.windows.update(tab.windowId, { focused: true });
      return;
    } catch {
      /* fall through and open a fresh tab */
    }
  }
  const created = await ext.tabs.create({ url: appUrl() });
  if (created?.id != null) await storageSet({ [APP_TAB_KEY]: created.id });
}

async function openSidePanel(windowId?: number): Promise<void> {
  // Chrome: chrome.sidePanel. Firefox: chrome.sidebarAction. Fall back to full app.
  try {
    const sp = (ext as unknown as { sidePanel?: { open(opts: { windowId?: number }): Promise<void> } })
      .sidePanel;
    if (sp && windowId != null) {
      await sp.open({ windowId });
      return;
    }
  } catch {
    /* try next */
  }
  try {
    const sb = (ext as unknown as { sidebarAction?: { open(opts: { windowId?: number }): Promise<void> } })
      .sidebarAction;
    if (sb) {
      await sb.open(windowId != null ? { windowId } : {});
      return;
    }
  } catch {
    /* fall through to full app */
  }
  await openFullApp();
}

/** Works with Chrome's callback form and Firefox's promise form. */
function createMenu(props: unknown): void {
  try {
    const create = ext.contextMenus.create as unknown as (
      properties: unknown,
      callback?: () => void,
    ) => Promise<void> | void;
    const result = create(props, () => void ext.runtime.lastError);
    if (result && typeof result.catch === "function") result.catch(() => undefined);
  } catch {
    /* menu already exists or context menus unavailable */
  }
}

ext.runtime.onInstalled.addListener(() => {
  createMenu({
    id: "quick-capture-selection",
    title: "Capture selection to Bear Notes",
    contexts: ["selection"],
  });
  createMenu({
    id: "open-bear-notes",
    title: "Open Bear Notes",
    contexts: ["action"],
  });
});

ext.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "open-bear-notes") {
    await openFullApp();
    return;
  }
  if (info.menuItemId === "quick-capture-selection") {
    // Persist pending capture; popup/side panel/full app picks it up on load.
    const text = info.selectionText ?? "";
    await storageSet({ "bear-pending-capture": { text, createdAt: Date.now() } });
    const [tab] = await ext.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    await openSidePanel(tab?.windowId);
  }
});

ext.commands.onCommand.addListener(async (command) => {
  if (command === "quick-capture") {
    const [tab] = await ext.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    await openSidePanel(tab?.windowId);
  }
});
