"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopbarClient } from "./TopbarClient";
import { GlobalRail } from "./GlobalRail";
import { CelebrationLayer } from "../ui/CelebrationLayer";
import { useTheme } from "../theme/ThemeProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const theme = useTheme();
  const nav = (theme.preferences.navigationPreferences || {}) as Record<string, unknown>;
  const collapsed = nav.collapseSidebarOnLaunch === true;
  useEffect(() => { const close = () => setSidebarOpen(false); window.addEventListener("resize", close); return () => window.removeEventListener("resize", close); }, []);
  function handleMenu() {
    if (typeof window !== "undefined" && window.innerWidth > 820) {
      theme.setPreferences({ navigationPreferences: { ...nav, collapseSidebarOnLaunch: !collapsed } });
    } else setSidebarOpen(true);
  }
  return <div className="asana-shell" data-sidebar-open={sidebarOpen} data-sidebar-collapsed={collapsed}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <TopbarClient onMenu={handleMenu} />
    <div className="asana-shell-body">
      <GlobalRail />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && <button className="side-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <main id="main-content" className="main asana-main" tabIndex={-1}>{children}</main>
      <CelebrationLayer />
    </div>
  </div>;
}
