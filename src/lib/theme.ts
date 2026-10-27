import type { ThemePref } from "./types";

const ATTR = "data-theme";

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePref): void {
  document.documentElement.setAttribute(ATTR, resolveTheme(pref));
}

/** Keep in sync with OS when pref is "system". Returns cleanup fn. */
export function watchSystemTheme(pref: () => ThemePref): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyTheme(pref());
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
