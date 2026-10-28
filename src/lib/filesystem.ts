import { formatNoteMarkdown } from "./export";
import type { Note } from "./types";

export const isFileSystemAccessSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;

const DB_NAME = "SableFSDatabase";
const STORE_NAME = "handles";
const KEY_VAULT = "vaultDirectoryHandle";

/** Open a small IndexedDB dedicated to persisting FileSystemHandle objects */
function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported) return null;
  try {
    const db = await openHandleDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_VAULT);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(handle, KEY_VAULT);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearDirectoryHandle(): Promise<void> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(KEY_VAULT);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }
}

export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  readWrite = true,
): Promise<boolean> {
  const mode = readWrite ? "readwrite" : "read";
  try {
    const h = handle as unknown as {
      queryPermission?: (opts: { mode: string }) => Promise<string>;
      requestPermission?: (opts: { mode: string }) => Promise<string>;
    };
    if (typeof h.queryPermission === "function") {
      if ((await h.queryPermission({ mode })) === "granted") return true;
      if (typeof h.requestPermission === "function" && (await h.requestPermission({ mode })) === "granted") {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function pickVaultDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported) {
    throw new Error("File System Access API is not supported in this browser.");
  }
  const picker = (
    window as unknown as { showDirectoryPicker?: (opts: unknown) => Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker;
  if (!picker) throw new Error("Directory picker not available.");
  const handle = await picker({ mode: "readwrite" });
  await saveDirectoryHandle(handle);
  return handle;
}

function sanitizeFilename(title: string): string {
  const clean = title.replace(/[/\\:*?"<>|]/g, "_").trim();
  return clean || "Untitled";
}

export async function writeNoteToDirectory(dirHandle: FileSystemDirectoryHandle, note: Note): Promise<void> {
  const filename = `${sanitizeFilename(note.title)}.md`;
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const h = fileHandle as unknown as {
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  };
  const writable = await h.createWritable();
  const content = formatNoteMarkdown(note);
  await writable.write(content);
  await writable.close();
}

export async function syncAllNotesToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  notes: Note[],
): Promise<{ count: number }> {
  let count = 0;
  for (const note of notes) {
    await writeNoteToDirectory(dirHandle, note);
    count++;
  }
  return { count };
}

/**
 * Universal zero-dependency ZIP archive generator.
 * Produces standard uncompressed (STORE) ZIP blobs containing all notes as .md files.
 * Compatible with macOS Archive Utility, Windows Explorer, and Linux unzip.
 */
export function buildVaultZipBlob(notes: Note[]): Blob {
  const files: { name: string; data: Uint8Array }[] = [];
  const encoder = new TextEncoder();

  for (const note of notes) {
    const filename = `${sanitizeFilename(note.title)}.md`;
    const text = formatNoteMarkdown(note);
    files.push({ name: filename, data: encoder.encode(text) });
  }

  // Calculate CRC-32 table
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c;
  }

  function crc32(buf: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  const centralRecords: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (30 bytes + name + data)
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); // Local header signature
    view.setUint16(4, 20, true); // Version needed to extract (2.0)
    view.setUint16(6, 0, true); // General purpose bit flag
    view.setUint16(8, 0, true); // Compression: 0 (Stored)
    view.setUint16(10, 0, true); // Last mod time
    view.setUint16(12, 0, true); // Last mod date
    view.setUint32(14, crc, true); // CRC-32
    view.setUint32(18, size, true); // Compressed size
    view.setUint32(22, size, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true); // Filename length
    view.setUint16(28, 0, true); // Extra field length
    local.set(nameBytes, 30);

    parts.push(local);
    parts.push(file.data);

    // Central directory file header (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cview = new DataView(central.buffer);
    cview.setUint32(0, 0x02014b50, true); // Central directory signature
    cview.setUint16(4, 20, true); // Version made by
    cview.setUint16(6, 20, true); // Version needed
    cview.setUint16(8, 0, true); // Bit flag
    cview.setUint16(10, 0, true); // Compression: 0
    cview.setUint16(12, 0, true); // Mod time
    cview.setUint16(14, 0, true); // Mod date
    cview.setUint32(16, crc, true); // CRC-32
    cview.setUint32(20, size, true); // Compressed size
    cview.setUint32(24, size, true); // Uncompressed size
    cview.setUint16(28, nameBytes.length, true); // Name length
    cview.setUint16(30, 0, true); // Extra field length
    cview.setUint16(32, 0, true); // Comment length
    cview.setUint16(34, 0, true); // Disk number
    cview.setUint16(36, 0, true); // Internal attributes
    cview.setUint32(38, 0, true); // External attributes
    cview.setUint32(42, offset, true); // Relative offset of local header
    central.set(nameBytes, 46);

    centralRecords.push(central);
    offset += local.length + size;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const cr of centralRecords) {
    parts.push(cr);
    centralSize += cr.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eview = new DataView(eocd.buffer);
  eview.setUint32(0, 0x06054b50, true); // EOCD signature
  eview.setUint16(4, 0, true); // Disk number
  eview.setUint16(6, 0, true); // Start disk
  eview.setUint16(8, files.length, true); // Records on this disk
  eview.setUint16(10, files.length, true); // Total records
  eview.setUint32(12, centralSize, true); // Size of central directory
  eview.setUint32(16, centralOffset, true); // Offset of central directory
  eview.setUint16(20, 0, true); // Comment length
  parts.push(eocd);

  return new Blob(parts, { type: "application/zip" });
}

export function downloadVaultZip(notes: Note[]): void {
  const blob = buildVaultZipBlob(notes);
  const d = new Date();
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const filename = `sable-notes-vault-${yyyymmdd}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
