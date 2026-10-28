import "../styles.css";
import { openApp, storageGet, storageRemove } from "../lib/extension";
import { extractTitle } from "../lib/markdown";
import { createNote, ensureSeed, getSettings, listNotes } from "../lib/storage";
import { applyTheme } from "../lib/theme";

const PENDING_KEYS = ["sable-pending-capture", "bear-pending-capture"];
const box = document.getElementById("capture") as HTMLTextAreaElement;
const status = document.getElementById("status") as HTMLElement;
const recent = document.getElementById("recent") as HTMLElement;

async function refreshRecent(): Promise<void> {
  const notes = (await listNotes().catch(() => [])).slice(0, 8);
  recent.innerHTML = "";
  for (const n of notes) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = n.title || "Untitled";
    b.addEventListener("click", () => {
      void openApp(n.id);
    });
    recent.appendChild(b);
  }
  if (notes.length === 0) {
    recent.innerHTML = `<span class="status">No notes yet.</span>`;
  }
}

type PendingCapture = { text?: string };

async function consumePending(): Promise<void> {
  try {
    const got = await storageGet<PendingCapture>(PENDING_KEYS);
    for (const key of PENDING_KEYS) {
      const text = got[key]?.text;
      if (text) {
        box.value = text;
        await storageRemove([key]);
        break;
      }
    }
  } catch {
    /* ignore */
  }
}

async function save(): Promise<void> {
  const body = box.value.trim();
  if (!body) {
    status.textContent = "Empty — nothing saved";
    return;
  }
  await createNote(extractTitle(body) || "Quick capture", body);
  box.value = "";
  status.textContent = "Saved ✓";
  await refreshRecent();
}

function init(): void {
  document.getElementById("save")?.addEventListener("click", () => void save());
  box.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  });
  document.getElementById("open-full")?.addEventListener("click", () => {
    void openApp();
  });

  getSettings()
    .then((s) => applyTheme(s.theme))
    .catch(() => applyTheme("system"));
  ensureSeed()
    .catch(() => undefined)
    .then(() => refreshRecent())
    .then(() => consumePending())
    .catch(() => undefined);
}

init();
