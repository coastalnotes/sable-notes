import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const targets = ["dist-chrome", "dist-firefox"];
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`  ✗ ${message}`);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

for (const target of targets) {
  const dir = join(root, target);
  console.log(`Verifying ${target}…`);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    fail("missing manifest.json");
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`manifest.json is not valid JSON (${error.message})`);
    continue;
  }

  if (manifest.manifest_version !== 3) fail("manifest_version must be 3");

  for (const [size, path] of Object.entries(manifest.icons ?? {})) {
    if (!existsSync(join(dir, path))) fail(`missing icon ${size} (${path})`);
  }

  const popup = manifest.action?.default_popup;
  if (!popup || !existsSync(join(dir, popup))) fail("missing action popup");

  if (manifest.background?.service_worker) {
    if (!existsSync(join(dir, manifest.background.service_worker))) fail("missing background service worker");
  } else if (Array.isArray(manifest.background?.scripts)) {
    for (const script of manifest.background.scripts) {
      if (!existsSync(join(dir, script))) fail(`missing background script ${script}`);
    }
  } else {
    fail("no background entry declared");
  }

  const panelPath = manifest.side_panel?.default_path ?? manifest.sidebar_action?.default_panel;
  if (!panelPath || !existsSync(join(dir, panelPath))) fail("missing side panel document");

  const appPage = join(dir, "app/index.html");
  if (!existsSync(appPage)) fail("missing app/index.html");

  // Every local asset referenced from HTML must exist.
  const htmlFiles = walk(dir).filter((f) => f.endsWith(".html"));
  for (const htmlFile of htmlFiles) {
    const html = readFileSync(htmlFile, "utf8");
    for (const [, ref] of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
      const resolved = join(dirname(htmlFile), ref);
      if (!existsSync(resolved)) fail(`${htmlFile.slice(root.length + 1)} references missing ${ref}`);
    }
  }

  // Stale chunk guard: every asset must be mentioned by some text file.
  const assetsDir = join(dir, "assets");
  if (existsSync(assetsDir)) {
    const textBlobs = walk(dir)
      .filter((f) => !f.startsWith(assetsDir) || !/\.(png|jpe?g|webp|svg|gif)$/i.test(f))
      .map((f) => readFileSync(f, "utf8"));
    for (const asset of readdirSync(assetsDir)) {
      if (!textBlobs.some((blob) => blob.includes(asset))) {
        fail(`stale unreferenced asset ${basename(asset)} (package was not cleaned)`);
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} packaging problem(s) found.`);
  process.exit(1);
}
console.log("\nBoth extension packages look good.");
