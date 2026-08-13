"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { Icon } from "../ui/Icon";
import { api } from "../../lib/api";
import { signOut } from "../../lib/logout";

type Profile = { displayName?: string; email?: string };

export function UserMenu() {
  const { theme, setTheme, themes } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  // Resolved on the client only, so the server render stays deterministic and
  // hydration cannot mismatch. The previous build read a `pm_user_name` cookie
  // that the API never sets, so the menu always said "Personal".
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    let cancelled = false;
    api<Profile>("/me/profile", { org: true })
      .then((p) => { if (!cancelled && p?.displayName) setDisplayName(p.displayName); })
      .catch(() => { /* menu still works without a name */ });
    return () => { cancelled = true; };
  }, []);

  const initials = displayName
    ? displayName.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "PM";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  }

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button className="user-trigger" aria-label="Open user menu — profile, theme and sign out">
          <span className="user-avatar">{initials}</span>
          <span className="user-trigger-copy">
            <strong>{displayName || "Personal"}</strong>
            <span>Account & sign out</span>
          </span>
          <Icon name="chevronDown" size={16} />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="menu user-menu" sideOffset={8} align="end">
          <div className="user-menu-head">
            <div className="user-avatar large">{initials}</div>
            <div>
              <div className="ui-static-e3ec02ac">{displayName || "My account"}</div>
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
          {/* onSelect (not onClick) is the event Radix fires for keyboard *and*
              pointer activation, so the item works either way. */}
          <Dropdown.Item
            className="menu-item menu-item-danger"
            data-testid="sign-out"
            onSelect={(event) => { event.preventDefault(); void handleSignOut(); }}
          >
            <Icon name="arrowLeft" size={16} />
            <span>{signingOut ? "Signing out…" : "Log out"}</span>
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
