/**
 * Central source for user-selectable theme and project palette values.
 * Components consume these semantic configuration values instead of embedding
 * raw color literals in route or component TSX.
 */
export type ThemePreset =
  | "asana" | "slack-aubergine" | "slack-huddle" | "slack-lagoon" | "slack-mocha" | "slack-banana"
  | "ocean" | "forest" | "sunset" | "rose" | "indigo" | "teal";
export type ThemeMode = "light" | "dark" | "system";
export type ChromeTone = "black" | "gray" | "accent";

export const VIEWPORT_THEME_COLOR = "#6D5BD0";
export const DEFAULT_ACCENT = "#5b5fc7";
export const LIGHT_INK = "#ffffff";
export const DARK_INK = "#111318";

export const PROJECT_COLOR_PALETTE = [
  "#5b5fc7", "#f06a6a", "#e7a82f", "#20aa8f", "#4573d2", "#8d84e8", "#ea4e9d", "#7a7978",
] as const;

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

export function normalizeHex(value: string) {
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : "";
}

export function rgbChannels(hex: string) {
  const value = hex.replace("#", "");
  return `${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)}`;
}

export function readableInk(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? LIGHT_INK : DARK_INK;
}
