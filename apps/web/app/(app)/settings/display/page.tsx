"use client";
import { useState } from "react";
import { SettingsShell } from "../../../../components/settings/SettingsShell";
import { useTheme } from "../../../../components/theme/ThemeProvider";

const backgrounds = ["golden", "sunset", "confetti", "waves", "grid", "lavender", "midnight", "plain"];
export default function DisplaySettings() {
  const t = useTheme();
  const [custom, setCustom] = useState(t.customAccent || "#5b5fc7");
  const applyCustom = () => { if (/^#[0-9a-fA-F]{6}$/.test(custom.trim())) t.setCustomAccent(custom.trim()); };
  return <SettingsShell><div className="settings-section">
    <h2>Display</h2><p>Match the compact Asana-style workspace chrome or switch to a built-in Slack-inspired color combination.</p>
    <div className="setting-block"><strong>Theme mode</strong><div className="segmented">{(["light","dark","system"] as const).map(x=><button data-on={t.mode===x} onClick={()=>t.setMode(x)} key={x}>{x}</button>)}</div></div>
    <div className="setting-block"><strong>Color combinations</strong><div className="theme-grid">{t.themes.map(x=><button className="theme-card" data-on={t.theme===x.id && !t.customAccent} onClick={()=>t.setTheme(x.id)} key={x.id}><span className="theme-swatch split" style={{background:`linear-gradient(135deg,${x.swatch} 0 52%,${x.secondary} 52% 100%)`}}/><span><b>{x.name}</b><small>{x.description}</small></span></button>)}</div></div>
    <div className="setting-block"><strong>Custom accent</strong><p className="setting-copy">Use your own brand color while keeping the same layout and interaction density.</p><div className="custom-accent-row"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(custom)?custom:"#5b5fc7"} onChange={e=>setCustom(e.target.value)}/><input className="input" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="#5b5fc7"/><button className="btn" onClick={applyCustom}>Apply</button><button className="btn btn-ghost" onClick={()=>{setCustom("");t.setCustomAccent("")}}>Reset</button></div></div>
    <div className="setting-block"><strong>Sidebar & top bar</strong><div className="segmented">{(["black","gray","accent"] as const).map(x=><button data-on={t.chromeTone===x} onClick={()=>t.setChromeTone(x)} key={x}>{x}</button>)}</div></div>
    <div className="setting-block"><strong>Density</strong><div className="segmented">{(["comfortable","compact"] as const).map(x=><button data-on={t.density===x} onClick={()=>t.setDensity(x)} key={x}>{x}</button>)}</div></div>
    <div className="setting-block"><strong>Home background</strong><div className="background-grid">{backgrounds.map(x=><button className={`bg-thumb bg-${x}`} data-on={t.homeBackground===x} onClick={()=>t.setHomeBackground(x)} key={x}>{x}</button>)}</div></div>
  </div></SettingsShell>;
}
