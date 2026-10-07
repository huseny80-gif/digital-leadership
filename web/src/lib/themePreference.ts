"use client";

import { useSyncExternalStore } from "react";
const themeKey = "digital-leadership-theme";
let fallbackTheme: "dark" | "light" | null = null;
function readTheme(): "dark" | "light" {
  if (fallbackTheme) return fallbackTheme;
  try {
    return localStorage.getItem(themeKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("platform-theme-changed", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("platform-theme-changed", listener);
  };
}
export function useThemePreference() {
  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    () => "dark" as const,
  );
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(themeKey, next);
      fallbackTheme = null;
    } catch {
      fallbackTheme = next;
    }
    window.dispatchEvent(new Event("platform-theme-changed"));
  };
  return { dark: theme === "dark", toggle };
}
