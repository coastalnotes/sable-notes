import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const args = process.argv.slice(2);
const target = args.includes("firefox") ? "firefox" : "chrome";
const manifestOnly = args.includes("--manifest-only");
const distDir = join(root, "dist");
const outDir = join(root, target === "firefox" ? "dist-firefox" : "dist-chrome");
const manifestSrc = join(
  root,
  "src",
  target === "firefox" ? "manifest.firefox.json" : "manifest.chrome.json",
);

if (!manifestOnly) {
  if (!existsSync(distDir)) {
    console.error(`Missing ${distDir}. Run "npm run build" first.`);
    process.exit(1);
  }
  // Clean the target first so removed/renamed chunks never linger in a package.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const entry of readdirSync(distDir)) {
    cpSync(join(distDir, entry), join(outDir, entry), { recursive: true });
  }
} else {
  mkdirSync(outDir, { recursive: true });
}

// Overlay the target manifest and fail loudly on malformed JSON.
copyFileSync(manifestSrc, join(outDir, "manifest.json"));
JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));

if (!manifestOnly && !existsSync(join(outDir, "icons"))) {
  console.warn("No icons/ in build output — add PNGs under src/public/icons/");
}

console.log(`Packaged ${target} build -> ${outDir}${manifestOnly ? " (manifest only)" : ""}`);
