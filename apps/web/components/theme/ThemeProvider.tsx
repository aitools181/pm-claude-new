"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../lib/api";

import {
  THEME_PRESETS, normalizeHex, readableInk, rgbChannels,
  type ChromeTone, type ThemeMode, type ThemePreset,
} from "./themeTokens";

export { THEME_PRESETS, type ChromeTone, type ThemeMode, type ThemePreset } from "./themeTokens";
type PreferenceRow = { themeMode: ThemeMode; chromeTone: ChromeTone; colorPreset: ThemePreset; customAccent?: string | null; homeBackground: string; density: "comfortable" | "compact" };
type ThemeContextValue = {
  theme: ThemePreset; mode: ThemeMode; chromeTone: ChromeTone; customAccent: string; homeBackground: string; density: "comfortable" | "compact";
  setTheme: (next: ThemePreset) => void; setMode: (next: ThemeMode) => void; setChromeTone: (next: ChromeTone) => void; setCustomAccent: (next: string) => void; setHomeBackground: (next: string) => void; setDensity: (next: "comfortable" | "compact") => void;
  themes: typeof THEME_PRESETS;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const KEY = "pm_ui_preferences";
const defaults: PreferenceRow = { themeMode: "light", chromeTone: "black", colorPreset: "asana", customAccent: "", homeBackground: "golden", density: "comfortable" };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<PreferenceRow>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) })); } catch {}
    setHydrated(true);
    api<PreferenceRow>("/ui/preferences", { org: true }).then((row) => setPrefs((p) => ({ ...p, ...row }))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.dataset.theme = prefs.colorPreset;
    root.dataset.themeMode = prefs.themeMode;
    root.dataset.chrome = prefs.chromeTone;
    root.dataset.density = prefs.density;
    const custom = normalizeHex(prefs.customAccent || "");
    if (custom) {
      root.style.setProperty("--accent", custom);
      root.style.setProperty("--primary", custom);
      root.style.setProperty("--accent-rgb", rgbChannels(custom));
      root.style.setProperty("--accent-ink", readableInk(custom));
      root.style.setProperty("--primary-ink", readableInk(custom));
    } else {
      root.style.removeProperty("--accent"); root.style.removeProperty("--primary"); root.style.removeProperty("--accent-rgb"); root.style.removeProperty("--accent-ink"); root.style.removeProperty("--primary-ink"); root.style.removeProperty("--focus");
    }
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs, hydrated]);

  function update(patch: Partial<PreferenceRow>) {
    setPrefs((p) => ({ ...p, ...patch }));
    api("/ui/preferences", { method: "PATCH", org: true, body: JSON.stringify(patch) }).catch(() => {});
  }

  const value = useMemo<ThemeContextValue>(() => ({
    theme: prefs.colorPreset, mode: prefs.themeMode, chromeTone: prefs.chromeTone, customAccent: prefs.customAccent || "", homeBackground: prefs.homeBackground, density: prefs.density,
    setTheme: (colorPreset) => update({ colorPreset, customAccent: "" }), setMode: (themeMode) => update({ themeMode }), setChromeTone: (chromeTone) => update({ chromeTone }), setCustomAccent: (customAccent) => update({ customAccent: normalizeHex(customAccent) || customAccent }), setHomeBackground: (homeBackground) => update({ homeBackground }), setDensity: (density) => update({ density }), themes: THEME_PRESETS,
  }), [prefs]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("useTheme must be used inside ThemeProvider"); return value; }
