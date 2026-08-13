"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput } from "../../../../components/ui";
import { useState } from "react";
import { SettingsShell } from "../../../../components/settings/SettingsShell";
import { useTheme } from "../../../../components/theme/ThemeProvider";
import { DEFAULT_ACCENT } from "../../../../components/theme/themeTokens";
import { RuntimeStyle } from "../../../../components/ui/RuntimeStyle";

const backgrounds = ["golden", "sunset", "confetti", "waves", "grid", "lavender", "midnight", "plain"];
export default function DisplaySettings() {
  const t = useTheme();
  const [custom, setCustom] = useState(t.customAccent || DEFAULT_ACCENT);
  const applyCustom = () => { if (/^#[0-9a-fA-F]{6}$/.test(custom.trim())) t.setCustomAccent(custom.trim()); };
  return <SettingsShell><div className="settings-section">
    <h2>Display</h2><p>Match the compact Asana-style workspace chrome or switch to a built-in Slack-inspired color combination.</p>
    <div className="setting-block"><strong>Theme mode</strong><div className="segmented">{(["light","dark","system"] as const).map(x=><button data-on={t.mode===x} onClick={()=>t.setMode(x)} key={x}>{x}</button>)}</div></div>
    <div className="setting-block"><strong>Color combinations</strong><div className="theme-grid">{t.themes.map(x=><button className="theme-card" data-on={t.theme===x.id && !t.customAccent} onClick={()=>t.setTheme(x.id)} key={x.id}><RuntimeStyle as="span" className="theme-swatch split runtime-theme-swatch" vars={{ "--runtime-swatch-primary": x.swatch, "--runtime-swatch-secondary": x.secondary }} /><span><b>{x.name}</b><small>{x.description}</small></span></button>)}</div></div>
    <div className="setting-block"><strong>Custom accent</strong><p className="setting-copy">Use your own brand color while keeping the same layout and interaction density.</p><div className="custom-accent-row"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(custom)?custom:DEFAULT_ACCENT} onChange={e=>setCustom(e.target.value)}/><UiInput className="input" value={custom} onChange={e=>setCustom(e.target.value)} placeholder={DEFAULT_ACCENT}/><UiButton variant="secondary"  onClick={applyCustom}>Apply</UiButton><UiButton variant="tertiary"  onClick={()=>{setCustom("");t.setCustomAccent("")}}>Reset</UiButton></div></div>
    <div className="setting-block"><strong>Sidebar & top bar</strong><div className="segmented">{(["black","gray","accent"] as const).map(x=><button data-on={t.chromeTone===x} onClick={()=>t.setChromeTone(x)} key={x}>{x}</button>)}</div></div>
    <div className="setting-block"><strong>Density</strong><div className="segmented">{(["comfortable","compact"] as const).map(x=><button data-on={t.density===x} onClick={()=>t.setDensity(x)} key={x}>{x}</button>)}</div></div>
    <div className="setting-block"><strong>Home background</strong><div className="background-grid">{backgrounds.map(x=><button className={`bg-thumb bg-${x}`} data-on={t.homeBackground===x} onClick={()=>t.setHomeBackground(x)} key={x}>{x}</button>)}</div></div>
  </div></SettingsShell>;
}
