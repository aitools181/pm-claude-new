"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useMemo, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { Icon } from "../ui/Icon";
import { api } from "../../lib/api";
import { disconnectSocket } from "../../lib/realtime";

export function UserMenu() {
  const { theme, setTheme, themes } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { await api("/auth/logout", { method: "POST" }); } catch { /* local cleanup still applies */ }
    disconnectSocket();
    document.cookie = "pm_org=; path=/; max-age=0; samesite=lax";
    window.location.assign("/login");
  }

  const initials = useMemo(() => {
    if (typeof document === "undefined") return "PM";
    const match = document.cookie.match(/(?:^|; )pm_user_name=([^;]+)/);
    if (!match) return "PM";
    const raw = decodeURIComponent(match[1]);
    return raw.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }, []);

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button className="user-trigger" aria-label="Open user menu">
          <span className="user-avatar">{initials}</span>
          <span className="user-trigger-copy">
            <strong>Personal</strong>
            <span>Settings & theme</span>
          </span>
          <Icon name="chevronDown" size={16} />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="menu user-menu" sideOffset={8} align="end">
          <div className="user-menu-head">
            <div className="user-avatar large">{initials}</div>
            <div>
              <div className="ui-static-e3ec02ac">My account</div>
              <div className="muted ui-static-6cb285c6" >Profile, preferences and workspace controls</div>
            </div>
          </div>

          <Dropdown.Item className="menu-item" asChild>
            <a href="/settings/profile"><Icon name="user" size={16} />Profile settings</a>
          </Dropdown.Item>
          <Dropdown.Item className="menu-item" asChild>
            <a href="/settings/display"><Icon name="sliders" size={16} />Preferences</a>
          </Dropdown.Item>
          <Dropdown.Item className="menu-item" asChild>
            <a href="/settings/workspace"><Icon name="settings" size={16} />Workspace settings</a>
          </Dropdown.Item>
          <Dropdown.Item className="menu-item" asChild>
            <a href="/settings/sessions"><Icon name="shield" size={16} />Security & sessions</a>
          </Dropdown.Item>

          <div className="menu-sep" />
          <Dropdown.Item className="menu-item" asChild>
            <button type="button" onClick={signOut} disabled={signingOut}>
              <Icon name="arrowLeft" size={16} />{signingOut ? "Signing out…" : "Sign out"}
            </button>
          </Dropdown.Item>

          <div className="menu-sep" />
          <div className="menu-theme-group">
            <div className="menu-section-title">Theme presets</div>
            {themes.map((preset) => (
              <button key={preset.id} className="theme-preset-item" type="button" data-on={theme === preset.id} onClick={() => setTheme(preset.id)}>
                <span>
                  <strong>{preset.name}</strong>
                  <small>{preset.description}</small>
                </span>
                {theme === preset.id && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
