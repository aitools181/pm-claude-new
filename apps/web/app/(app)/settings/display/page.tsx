"use client";

import { useEffect, useState } from "react";
import { Button as UiButton, Input as UiInput, Select as UiSelect, Switch } from "../../../../components/ui";
import { SettingsShell } from "../../../../components/settings/SettingsShell";
import { useTheme } from "../../../../components/theme/ThemeProvider";
import { DEFAULT_ACCENT, type CustomTheme } from "../../../../components/theme/themeTokens";
import { RuntimeStyle } from "../../../../components/ui/RuntimeStyle";

const backgrounds = ["golden", "sunset", "confetti", "waves", "grid", "lavender", "midnight", "plain"];
const customLabels: [keyof CustomTheme, string][] = [
  ["accent", "Action color"], ["secondary", "Secondary accent"], ["topbar", "Top bar"],
  ["rail", "Product rail"], ["sidebar", "Workspace sidebar"], ["sidebarHover", "Sidebar selected / hover"],
];
const languageOptions = [
  ["en", "English"], ["gu", "ગુજરાતી"], ["hi", "हिन्दी"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["ja", "日本語"],
] as const;
const landingOptions = [["/home","Home"],["/my-tasks","My tasks"],["/inbox","Inbox"],["/projects","Projects"],["/portfolios","Portfolios"]] as const;

export default function DisplaySettings() {
  const t = useTheme();
  const [custom, setCustom] = useState(t.customAccent || DEFAULT_ACCENT);
  const [draftTheme, setDraftTheme] = useState<CustomTheme>(t.customTheme);
  useEffect(() => setDraftTheme(t.customTheme), [t.customTheme]);
  const p = t.preferences;
  const applyCustomAccent = () => { if (/^#[0-9a-fA-F]{6}$/.test(custom.trim())) t.setCustomAccent(custom.trim()); };
  const setDraftColor = (key: keyof CustomTheme, value: string) => setDraftTheme((prev) => ({ ...prev, [key]: value }));

  return <SettingsShell><div className="settings-section display-settings">
    <h2>Display</h2><p>Control language, density, accessibility, notifications, landing behavior, and workspace colors from one place.</p>

    <div className="setting-block"><strong>Language & regional</strong>
      <label className="setting-row"><span><strong>Language</strong><small>Used for the document language and locale-aware UI formatting.</small></span><UiSelect value={p.locale} onChange={(e)=>t.setPreferences({ locale:e.target.value })}>{languageOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</UiSelect></label>
      <label className="setting-row"><span><strong>First day of week</strong><small>Personal calendar preference. Workspace policy remains unchanged.</small></span><UiSelect value={p.personalWeekStart ?? ""} onChange={(e)=>t.setPreferences({ personalWeekStart:e.target.value===""?null:Number(e.target.value) })}><option value="">Use workspace default</option><option value="0">Sunday</option><option value="1">Monday</option><option value="6">Saturday</option></UiSelect></label>
    </div>

    <div className="setting-block"><strong>Behavior</strong>
      <label className="setting-row"><span><strong>Notification pop-up duration</strong><small>How long non-critical toast messages remain visible.</small></span><UiSelect value={String(p.notificationPopupSeconds)} onChange={(e)=>t.setPreferences({ notificationPopupSeconds:Number(e.target.value) })}><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="8">8 seconds</option><option value="12">12 seconds</option><option value="20">20 seconds</option></UiSelect></label>
      <label className="setting-row"><span><strong>Default landing page</strong><small>Preferred destination when opening the product.</small></span><UiSelect value={p.defaultLanding} onChange={(e)=>t.setPreferences({ defaultLanding:e.target.value })}>{landingOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</UiSelect></label>
      <Switch label="Show row numbers" description="Show stable visual row numbers in task and project data views." checked={p.showRowNumbers} onChange={(showRowNumbers)=>t.setPreferences({showRowNumbers})}/>
      <Switch label="Color-blind friendly mode" description="Adds stronger non-color cues and pattern/shape distinctions to semantic states." checked={p.colorBlindMode} onChange={(colorBlindMode)=>t.setPreferences({colorBlindMode})}/>
      <Switch label="Celebrations" description="Show lightweight completion celebrations for successful work." checked={p.celebrations} onChange={(celebrations)=>t.setPreferences({celebrations})}/>
    </div>

    <div className="setting-block"><strong>Theme mode</strong><div className="segmented">{(["light","dark","system"] as const).map(x=><button data-on={t.mode===x} onClick={()=>t.setMode(x)} key={x}>{x}</button>)}</div></div>
    <div className="setting-block"><div className="setting-title-row"><div><strong>Workspace color themes</strong><p className="setting-copy">Colors change the shell and emphasis only. Component geometry and behavior stay consistent everywhere.</p></div><span className="theme-count">{t.themes.length} presets</span></div><div className="theme-grid">{t.themes.map(x=><button className="theme-card" data-on={t.theme===x.id && !t.customAccent} onClick={()=>{t.setTheme(x.id);t.setChromeTone("accent")}} key={x.id}>
      <RuntimeStyle as="span" className="theme-mini-preview" vars={{ "--runtime-theme-top": x.topbar, "--runtime-theme-side": x.sidebar, "--runtime-theme-accent": x.accent, "--runtime-theme-secondary": x.secondary }}><i/><i/><i/></RuntimeStyle>
      <span><b>{x.name}</b><small>{x.description}</small></span>
    </button>)}</div></div>
    <div className="setting-block"><strong>Custom workspace theme</strong><p className="setting-copy">Build your own theme. Contrast-aware text is calculated automatically for the top bar and sidebar.</p><div className="custom-theme-grid">{customLabels.map(([key,label])=><label className="custom-theme-color" key={key}><span>{label}</span><div><input type="color" value={draftTheme[key]} onChange={e=>setDraftColor(key,e.target.value)}/><UiInput value={draftTheme[key]} onChange={e=>setDraftColor(key,e.target.value)} aria-label={`${label} hex color`}/></div></label>)}</div><div className="custom-theme-actions"><UiButton variant="primary" onClick={()=>t.setCustomTheme(draftTheme)}>Use custom theme</UiButton><UiButton variant="tertiary" onClick={()=>setDraftTheme(t.customTheme)}>Undo edits</UiButton></div></div>
    <div className="setting-block"><strong>Single custom accent</strong><p className="setting-copy">Keep the selected theme chrome and replace only action/highlight colors.</p><div className="custom-accent-row"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(custom)?custom:DEFAULT_ACCENT} onChange={e=>setCustom(e.target.value)}/><UiInput className="input" value={custom} onChange={e=>setCustom(e.target.value)} placeholder={DEFAULT_ACCENT}/><UiButton variant="secondary" onClick={applyCustomAccent}>Apply accent</UiButton><UiButton variant="tertiary" onClick={()=>{setCustom("");t.setCustomAccent("")}}>Reset</UiButton></div></div>
    <div className="setting-block"><strong>Sidebar & top bar</strong><div className="segmented">{(["black","gray","accent"] as const).map(x=><button data-on={t.chromeTone===x} onClick={()=>t.setChromeTone(x)} key={x}>{x==="accent"?"theme colors":x}</button>)}</div></div>
    <div className="setting-block"><strong>Density</strong><div className="segmented">{(["comfortable","compact"] as const).map(x=><button data-on={t.density===x} onClick={()=>t.setDensity(x)} key={x}>{x}</button>)}</div></div>
    <div className="setting-block"><strong>Home background</strong><div className="background-grid">{backgrounds.map(x=><button className={`bg-thumb bg-${x}`} data-on={t.homeBackground===x} onClick={()=>t.setHomeBackground(x)} key={x}>{x}</button>)}</div></div>
  </div></SettingsShell>;
}
