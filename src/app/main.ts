import "../styles.css";
import "../lib/editor.css";
import { App } from "./app";

const app = new App(
  document.getElementById("app") as HTMLElement,
  document.getElementById("tag-list") as HTMLElement,
  document.getElementById("notes-list") as HTMLElement,
  document.getElementById("editor-host") as HTMLElement,
  document.getElementById("note-title") as HTMLInputElement,
  document.getElementById("search") as HTMLInputElement,
  document.getElementById("save-status") as HTMLElement,
);

void app.init();
