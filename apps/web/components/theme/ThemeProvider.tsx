"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import {
  DEFAULT_CUSTOM_THEME, THEME_PRESETS, normalizeHex, readableInk, rgbChannels,
  type ChromeTone, type CustomTheme, type ThemeMode, type ThemePreset,
} from "./themeTokens";

export { THEME_PRESETS, type ChromeTone, type CustomTheme, type ThemeMode, type ThemePreset } from "./themeTokens";
export type PreferenceRow = { themeMode: ThemeMode; chromeTone: ChromeTone; colorPreset: ThemePreset; customAccent?: string | null; customTheme?: Record<string, unknown> | null; homeBackground: string; density: "comfortable" | "compact"; locale: string; personalWeekStart?: number | null; workspaceWeekStart?: number; notificationPopupSeconds: number; defaultLanding: string; showRowNumbers: boolean; colorBlindMode: boolean; celebrations: boolean; inboxSummaryEnabled: boolean; inboxSummaryTimeframe: string; navigationPreferences?: Record<string, unknown> | null };
type ThemeContextValue = {
  theme: ThemePreset; mode: ThemeMode; chromeTone: ChromeTone; customAccent: string; customTheme: CustomTheme; homeBackground: string; density: "comfortable" | "compact";
  setTheme: (next: ThemePreset) => void; setMode: (next: ThemeMode) => void; setChromeTone: (next: ChromeTone) => void; setCustomAccent: (next: string) => void; setCustomTheme: (next: CustomTheme) => void; setHomeBackground: (next: string) => void; setDensity: (next: "comfortable" | "compact") => void;
  preferences: PreferenceRow; setPreferences: (patch: Partial<PreferenceRow>) => void; themes: typeof THEME_PRESETS;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);
const KEY = "pm_ui_preferences";
const defaults: PreferenceRow = { themeMode: "light", chromeTone: "black", colorPreset: "asana", customAccent: "", customTheme: DEFAULT_CUSTOM_THEME, homeBackground: "golden", density: "comfortable", locale: "en", personalWeekStart: null, workspaceWeekStart: 1, notificationPopupSeconds: 5, defaultLanding: "/home", showRowNumbers: false, colorBlindMode: false, celebrations: true, inboxSummaryEnabled: true, inboxSummaryTimeframe: "week", navigationPreferences: {} };

function cleanCustomTheme(value?: Record<string, unknown> | null): CustomTheme {
  const nested = value && typeof value.colors === "object" && value.colors ? value.colors as Partial<CustomTheme> : value as Partial<CustomTheme> | null | undefined;
  const merged = { ...DEFAULT_CUSTOM_THEME, ...(nested || {}) };
  return Object.fromEntries(Object.entries(merged).map(([key, color]) => [key, normalizeHex(String(color)) || DEFAULT_CUSTOM_THEME[key as keyof CustomTheme]])) as CustomTheme;
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
    const customTheme = cleanCustomTheme(prefs.customTheme);
    const preset = THEME_PRESETS.find((item) => item.id === prefs.colorPreset) || THEME_PRESETS[0];
    const recipe = prefs.colorPreset === "custom" ? customTheme : preset;
    const customAccent = normalizeHex(prefs.customAccent || "");
    const accent = customAccent || recipe.accent;
    const secondary = customAccent || recipe.secondary;
    root.dataset.theme = prefs.colorPreset;
    root.dataset.themeMode = prefs.themeMode;
    root.dataset.chrome = prefs.chromeTone;
    root.dataset.density = prefs.density;
    root.dataset.colorBlind = prefs.colorBlindMode ? "true" : "false";
    root.lang = prefs.locale || "en";
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--coral", secondary);
    root.style.setProperty("--accent-rgb", rgbChannels(accent));
    root.style.setProperty("--accent-ink", readableInk(accent));
    root.style.setProperty("--primary-ink", readableInk(accent));
    root.style.setProperty("--theme-topbar", recipe.topbar);
    root.style.setProperty("--theme-rail", recipe.rail);
    root.style.setProperty("--theme-sidebar", recipe.sidebar);
    root.style.setProperty("--theme-sidebar-hover", recipe.sidebarHover);
    root.style.setProperty("--theme-topbar-ink", readableInk(recipe.topbar));
    root.style.setProperty("--theme-rail-ink", readableInk(recipe.rail));
    root.style.setProperty("--theme-sidebar-ink", readableInk(recipe.sidebar));
    root.style.setProperty("--theme-sidebar-hover-ink", readableInk(recipe.sidebarHover));
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = recipe.topbar;
    localStorage.setItem(KEY, JSON.stringify({ ...prefs, customTheme }));
  }, [prefs, hydrated]);
  function update(patch: Partial<PreferenceRow>) {
    setPrefs((p) => ({ ...p, ...patch }));
    api("/ui/preferences", { method: "PATCH", org: true, body: JSON.stringify(patch) }).catch(() => {});
  }
  const customTheme = cleanCustomTheme(prefs.customTheme);
  const value = useMemo<ThemeContextValue>(() => ({
    theme: prefs.colorPreset, mode: prefs.themeMode, chromeTone: prefs.chromeTone, customAccent: prefs.customAccent || "", customTheme, homeBackground: prefs.homeBackground, density: prefs.density,
    setTheme: (colorPreset) => update({ colorPreset, customAccent: "" }),
    setMode: (themeMode) => update({ themeMode }),
    setChromeTone: (chromeTone) => update({ chromeTone }),
    setCustomAccent: (customAccent) => update({ customAccent: normalizeHex(customAccent) || customAccent }),
    setCustomTheme: (next) => update({ colorPreset: "custom", customAccent: "", customTheme: { ...(prefs.customTheme || {}), colors: cleanCustomTheme(next) }, chromeTone: "accent" }),
    setHomeBackground: (homeBackground) => update({ homeBackground }),
    setDensity: (density) => update({ density }), preferences: prefs, setPreferences: update, themes: THEME_PRESETS,
  }), [prefs, customTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("useTheme must be used inside ThemeProvider"); return value; }
