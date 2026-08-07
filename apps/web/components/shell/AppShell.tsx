"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopbarClient } from "./TopbarClient";
import { GlobalRail } from "./GlobalRail";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { const close = () => setSidebarOpen(false); window.addEventListener("resize", close); return () => window.removeEventListener("resize", close); }, []);
  return <div className="asana-shell" data-sidebar-open={sidebarOpen}>
    <TopbarClient onMenu={() => setSidebarOpen(true)} />
    <div className="asana-shell-body">
      <GlobalRail />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && <button className="side-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <main className="main asana-main">{children}</main>
    </div>
  </div>;
}
