/**
 * User-selectable workspace themes. Layout stays Asana-like while chrome colors
 * can vary like Slack workspace themes. The UI consumes semantic CSS vars.
 */
export type ThemePreset =
  | "asana" | "slack-aubergine" | "slack-huddle" | "slack-lagoon" | "slack-mocha" | "slack-banana"
  | "slack-raspberry" | "slack-mint" | "ocean" | "forest" | "sunset" | "rose" | "indigo" | "teal"
  | "cobalt" | "sand" | "custom";
export type ThemeMode = "light" | "dark" | "system";
export type ChromeTone = "black" | "gray" | "accent";
export type CustomTheme = {
  accent: string;
  secondary: string;
  topbar: string;
  rail: string;
  sidebar: string;
  sidebarHover: string;
};
export type ThemeDefinition = CustomTheme & {
  id: Exclude<ThemePreset, "custom">;
  name: string;
  description: string;
  swatch: string;
};

export const VIEWPORT_THEME_COLOR = "#6D5BD0";
export const DEFAULT_ACCENT = "#5b5fc7";
export const LIGHT_INK = "#ffffff";
export const DARK_INK = "#111318";

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  accent: "#5b5fc7",
  secondary: "#f06a6a",
  topbar: "#252628",
  rail: "#17181a",
  sidebar: "#252628",
  sidebarHover: "#343538",
};

export const PROJECT_COLOR_PALETTE = [
  "#5b5fc7", "#f06a6a", "#e7a82f", "#20aa8f", "#4573d2", "#8d84e8", "#ea4e9d", "#7a7978",
] as const;

export const THEME_PRESETS: ThemeDefinition[] = [
  { id:"asana", name:"Asana", description:"Reference charcoal with coral create actions", swatch:"#f06a6a", accent:"#5b5fc7", secondary:"#f06a6a", topbar:"#252628", rail:"#17181a", sidebar:"#252628", sidebarHover:"#343538" },
  { id:"slack-aubergine", name:"Aubergine", description:"Plum chrome with warm gold highlights", swatch:"#611f69", accent:"#611f69", secondary:"#ecb22e", topbar:"#3f0e40", rail:"#350d36", sidebar:"#4a154b", sidebarHover:"#5d1c60" },
  { id:"slack-huddle", name:"Huddle", description:"Deep violet with orchid actions", swatch:"#4a154b", accent:"#7c3aed", secondary:"#d397f8", topbar:"#2f1235", rail:"#24102a", sidebar:"#3d1644", sidebarHover:"#54205d" },
  { id:"slack-lagoon", name:"Lagoon", description:"Navy chrome with cyan and mint", swatch:"#1264a3", accent:"#1264a3", secondary:"#2eb67d", topbar:"#0b3558", rail:"#082b49", sidebar:"#0f496f", sidebarHover:"#165d88" },
  { id:"slack-mocha", name:"Mocha", description:"Espresso chrome with sand accents", swatch:"#5b3a29", accent:"#8a5a44", secondary:"#d6a870", topbar:"#35251f", rail:"#2b1e1a", sidebar:"#493128", sidebarHover:"#604238" },
  { id:"slack-banana", name:"Graphite Gold", description:"Graphite shell with confident yellow", swatch:"#2d2e2f", accent:"#b7791f", secondary:"#ecb22e", topbar:"#232425", rail:"#171819", sidebar:"#2d2e2f", sidebarHover:"#3b3c3e" },
  { id:"slack-raspberry", name:"Raspberry", description:"Berry chrome with rose highlights", swatch:"#8f154f", accent:"#c2185b", secondary:"#f4a6c1", topbar:"#4b1230", rail:"#3b0e26", sidebar:"#66113d", sidebarHover:"#7f184e" },
  { id:"slack-mint", name:"Mint", description:"Deep green chrome with fresh mint", swatch:"#147d64", accent:"#168f74", secondary:"#7ee2c5", topbar:"#0b4638", rail:"#07382d", sidebar:"#0f5a49", sidebarHover:"#15715b" },
  { id:"ocean", name:"Ocean", description:"Calm blue collaboration palette", swatch:"#3f6ad8", accent:"#3f6ad8", secondary:"#5da9e9", topbar:"#18345f", rail:"#12284a", sidebar:"#21446f", sidebarHover:"#2b5688" },
  { id:"forest", name:"Forest", description:"Evergreen shell with sage accents", swatch:"#2f7d69", accent:"#2f7d69", secondary:"#67b99a", topbar:"#173d34", rail:"#102f28", sidebar:"#205345", sidebarHover:"#286757" },
  { id:"sunset", name:"Sunset", description:"Warm terracotta with rose accents", swatch:"#d65f4b", accent:"#c85543", secondary:"#f08c6c", topbar:"#633127", rail:"#51271f", sidebar:"#7b3a2e", sidebarHover:"#934839" },
  { id:"rose", name:"Rose", description:"Soft berry workspace palette", swatch:"#b84b74", accent:"#b84b74", secondary:"#e8789d", topbar:"#57243a", rail:"#451d2f", sidebar:"#6d2c49", sidebarHover:"#84385a" },
  { id:"indigo", name:"Indigo", description:"Focused purple-blue workspace", swatch:"#5b5fc7", accent:"#5b5fc7", secondary:"#8d84e8", topbar:"#292b63", rail:"#20214f", sidebar:"#353777", sidebarHover:"#444791" },
  { id:"teal", name:"Teal", description:"Fresh blue-green combination", swatch:"#168aad", accent:"#168aad", secondary:"#52b8a9", topbar:"#0e4657", rail:"#0a3744", sidebar:"#125b70", sidebarHover:"#19708a" },
  { id:"cobalt", name:"Cobalt", description:"Dark navy shell with electric blue", swatch:"#2457d6", accent:"#2457d6", secondary:"#7aa2ff", topbar:"#14244c", rail:"#0e1b3a", sidebar:"#1a3261", sidebarHover:"#23427d" },
  { id:"sand", name:"Sand", description:"Warm neutral shell with copper actions", swatch:"#9a5d39", accent:"#9a5d39", secondary:"#d9a36a", topbar:"#46372f", rail:"#382c26", sidebar:"#59473d", sidebarHover:"#6d574b" },
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
