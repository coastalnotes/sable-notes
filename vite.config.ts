import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "src",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2020",
    // The editor chunk is CodeMirror (~183 kB gzip) and is imported on demand
    // only after a note is opened, so it does not block first paint.
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      input: {
        app: resolve(__dirname, "src/app/index.html"),
        popup: resolve(__dirname, "src/popup/popup.html"),
        sidepanel: resolve(__dirname, "src/sidepanel/sidepanel.html"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        // Split the large CodeMirror/Dexie vendors so the app entry stays small
        // and editors/assets cache independently between releases.
        manualChunks: {
          codemirror: [
            "@codemirror/autocomplete",
            "@codemirror/commands",
            "@codemirror/lang-markdown",
            "@codemirror/language",
            "@codemirror/state",
            "@codemirror/view",
            "@lezer/common",
            "@lezer/highlight",
          ],
          dexie: ["dexie"],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
