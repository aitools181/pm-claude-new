export const CELEBRATION_EVENT = "pm:celebrate";

export function celebrateIfEnabled(detail: { label?: string } = {}) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("pm_ui_preferences");
    const enabled = raw ? JSON.parse(raw)?.celebrations !== false : true;
    if (!enabled) return;
  } catch {}
  window.dispatchEvent(new CustomEvent(CELEBRATION_EVENT, { detail }));
}
