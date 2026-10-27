/**
 * Cross-browser WebExtension helpers.
 *
 * Chrome exposes callback-style `chrome.*` and Firefox exposes promise-style
 * `browser.*`. We prefer `browser` when present and normalize storage calls to
 * promises so callers never have to care which runtime they run in.
 *
 * All helpers degrade gracefully to web APIs when the pages are opened with
 * `vite dev` (no extension context).
 */

type ChromeLikeApi = {
  runtime?: {
    id?: string;
    getURL?: (path: string) => string;
    lastError?: { message?: string };
  };
  storage?: {
    local?: {
      get(keys: string[] | Record<string, unknown>, cb?: (result: Record<string, unknown>) => void): unknown;
      set(items: Record<string, unknown>, cb?: () => void): unknown;
      remove(keys: string[], cb?: () => void): unknown;
    };
    onChanged?: {
      addListener(
        cb: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void,
      ): void;
    };
  };
  tabs?: {
    create(props: { url: string }): Promise<unknown> | unknown;
  };
};

const globalApi = globalThis as unknown as { browser?: ChromeLikeApi; chrome?: ChromeLikeApi };

/** Preferred extension API object, or `undefined` outside an extension context. */
export const ext: ChromeLikeApi | undefined = globalApi.browser ?? globalApi.chrome;

export function hasExtension(): boolean {
  return Boolean(ext?.runtime?.id);
}

function isPromise<T>(value: unknown): value is Promise<T> {
  return typeof (value as Promise<T> | undefined)?.then === "function";
}

export function runtimeUrl(path: string): string {
  if (hasExtension() && ext?.runtime?.getURL) return ext.runtime.getURL(path);
  // dev-server fallback: popup/ and sidepanel/ live one directory below app/.
  return new URL(`../${path}`, location.href).href;
}

/** Absolute URL of the full-tab app, optionally deep-linked to a note id. */
export function appUrl(noteId?: string): string {
  const base = runtimeUrl("app/index.html");
  return noteId ? `${base}#${encodeURIComponent(noteId)}` : base;
}

/** Open (or focus) the full-tab app, falling back to a new tab outside extensions. */
export async function openApp(noteId?: string): Promise<void> {
  const url = appUrl(noteId);
  try {
    if (ext?.tabs?.create) {
      await ext.tabs.create({ url });
      return;
    }
  } catch {
    /* fall through to window.open */
  }
  window.open(url, "_blank", "noopener");
}

export async function storageGet<T = unknown>(keys: string[]): Promise<Record<string, T>> {
  const store = ext?.storage?.local;
  if (!store) return {};
  try {
    const maybe = store.get(keys);
    if (isPromise<Record<string, T>>(maybe)) return (await maybe) ?? {};
  } catch {
    /* fall through to callback form */
  }
  return new Promise((resolve) => {
    try {
      store.get(keys, (result) => resolve((result as Record<string, T>) ?? {}));
    } catch {
      resolve({});
    }
  });
}

export async function storageSet(items: Record<string, unknown>): Promise<void> {
  const store = ext?.storage?.local;
  if (!store) return;
  try {
    const maybe = store.set(items);
    if (isPromise<void>(maybe)) {
      await maybe;
      return;
    }
  } catch {
    /* fall through to callback form */
  }
  await new Promise<void>((resolve, reject) => {
    try {
      store.set(items, () => {
        const err = ext?.runtime?.lastError;
        if (err) reject(new Error(err.message ?? "storage.set failed"));
        else resolve();
      });
    } catch (error) {
      reject(error as Error);
    }
  });
}

export async function storageRemove(keys: string[]): Promise<void> {
  const store = ext?.storage?.local;
  if (!store) return;
  try {
    const maybe = store.remove(keys);
    if (isPromise<void>(maybe)) {
      await maybe;
      return;
    }
  } catch {
    /* fall through to callback form */
  }
  await new Promise<void>((resolve) => {
    try {
      store.remove(keys, () => resolve());
    } catch {
      resolve();
    }
  });
}
