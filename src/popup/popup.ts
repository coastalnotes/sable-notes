import "../styles.css";
import { openApp, storageGet, storageRemove } from "../lib/extension";
import { extractTitle } from "../lib/markdown";
import { createNote, getSettings } from "../lib/storage";
import { applyTheme } from "../lib/theme";

const PENDING_KEYS = ["sable-pending-capture", "bear-pending-capture"];
const box = document.getElementById("capture") as HTMLTextAreaElement;
const status = document.getElementById("status") as HTMLElement;

type PendingCapture = { text?: string };

async function consumePendingCapture(): Promise<void> {
  // Read + clear pending capture (set by the context menu in the background worker).
  try {
    const got = await storageGet<PendingCapture>(PENDING_KEYS);
    for (const key of PENDING_KEYS) {
      const text = got[key]?.text;
      if (text) {
        box.value = box.value ? `${box.value}\n\n${text}` : text;
        await storageRemove([key]);
      }
    }
  } catch {
    /* ignore */
  }
}

function bindStatic(): void {
  document.getElementById("clear")?.addEventListener("click", () => {
    box.value = "";
    box.focus();
  });

  document.getElementById("save")?.addEventListener("click", () => void saveCapture());

  box.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void saveCapture();
    }
  });

  document.getElementById("open-full")?.addEventListener("click", () => {
    void (async () => {
      await openApp();
      window.close();
    })();
  });
}

async function saveCapture(): Promise<void> {
  const body = box.value.trim();
  if (!body) {
    status.textContent = "Empty — nothing saved";
    return;
  }
  const title = extractTitle(body) || "Quick capture";
  await createNote(title, body);
  status.textContent = "Saved ✓";
  box.value = "";
  setTimeout(() => window.close(), 450);
}

function init(): void {
  bindStatic();
  getSettings()
    .then((s) => applyTheme(s.theme))
    .catch(() => applyTheme("system"));
  consumePendingCapture()
    .catch(() => undefined)
    .finally(() => box.focus());
}

init();
