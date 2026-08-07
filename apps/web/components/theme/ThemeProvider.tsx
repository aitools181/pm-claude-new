"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../lib/api";

export type ThemePreset =
  | "asana" | "slack-aubergine" | "slack-huddle" | "slack-lagoon" | "slack-mocha" | "slack-banana"
  | "ocean" | "forest" | "sunset" | "rose" | "indigo" | "teal";
export type ThemeMode = "light" | "dark" | "system";
export type ChromeTone = "black" | "gray" | "accent";

export const THEME_PRESETS: { id: ThemePreset; name: string; description: string; swatch: string; secondary: string }[] = [
  { id: "asana", name: "Asana", description: "Charcoal chrome with coral actions", swatch: "#f06a6a", secondary: "#252628" },
  { id: "slack-aubergine", name: "Aubergine", description: "Slack-inspired plum and gold", swatch: "#611f69", secondary: "#ecb22e" },
  { id: "slack-huddle", name: "Huddle", description: "Deep violet with orchid accents", swatch: "#4a154b", secondary: "#d397f8" },
  { id: "slack-lagoon", name: "Lagoon", description: "Navy, cyan and mint combination", swatch: "#1264a3", secondary: "#2eb67d" },
  { id: "slack-mocha", name: "Mocha", description: "Warm espresso and sand combination", swatch: "#5b3a29", secondary: "#d6a870" },
  { id: "slack-banana", name: "Banana", description: "Dark graphite with warm yellow", swatch: "#2d2e2f", secondary: "#ecb22e" },
  { id: "ocean", name: "Ocean", description: "Calm blue collaboration palette", swatch: "#3f6ad8", secondary: "#5da9e9" },
  { id: "forest", name: "Forest", description: "Low-contrast green palette", swatch: "#2f7d69", secondary: "#67b99a" },
  { id: "sunset", name: "Sunset", description: "Warm orange and rose accents", swatch: "#d65f4b", secondary: "#f08c6c" },
  { id: "rose", name: "Rose", description: "Soft berry workspace palette", swatch: "#b84b74", secondary: "#e8789d" },
  { id: "indigo", name: "Indigo", description: "Focused purple-blue palette", swatch: "#5b5fc7", secondary: "#8d84e8" },
  { id: "teal", name: "Teal", description: "Fresh green-blue palette", swatch: "#168aad", secondary: "#52b8a9" },
];

type PreferenceRow = { themeMode: ThemeMode; chromeTone: ChromeTone; colorPreset: ThemePreset; customAccent?: string | null; homeBackground: string; density: "comfortable" | "compact" };
type ThemeContextValue = {
  theme: ThemePreset; mode: ThemeMode; chromeTone: ChromeTone; customAccent: string; homeBackground: string; density: "comfortable" | "compact";
  setTheme: (next: ThemePreset) => void; setMode: (next: ThemeMode) => void; setChromeTone: (next: ChromeTone) => void; setCustomAccent: (next: string) => void; setHomeBackground: (next: string) => void; setDensity: (next: "comfortable" | "compact") => void;
  themes: typeof THEME_PRESETS;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const KEY = "pm_ui_preferences";
const defaults: PreferenceRow = { themeMode: "light", chromeTone: "black", colorPreset: "asana", customAccent: "", homeBackground: "golden", density: "comfortable" };

function normalizeHex(value: string) {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return "";
}
function rgb(hex: string) {
  const value = hex.replace("#", "");
  return `${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)}`;
}

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
      root.style.setProperty("--accent-rgb", rgb(custom));
      root.style.setProperty("--focus", custom);
    } else {
      root.style.removeProperty("--accent"); root.style.removeProperty("--primary"); root.style.removeProperty("--accent-rgb"); root.style.removeProperty("--focus");
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
