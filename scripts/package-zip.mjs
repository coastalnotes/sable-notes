import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const targets = [
  { dir: "dist-chrome", zip: "sable-notes-chrome.zip" },
  { dir: "dist-firefox", zip: "sable-notes-firefox.zip" },
];

for (const { dir, zip } of targets) {
  const fullDir = join(root, dir);
  const zipPath = join(root, zip);
  if (!existsSync(fullDir)) {
    console.error(`Directory ${dir} not found. Run "npm run build:all" first.`);
    process.exit(1);
  }
  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: fullDir });
  const sizeKb = (statSync(zipPath).size / 1024).toFixed(1);
  console.log(`Created ${zip} (${sizeKb} kB) from ${dir}/`);
}
