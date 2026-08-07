import type { ReactNode } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { ToastProvider } from "../../components/ui/Toast";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ToastProvider><AppShell>{children}</AppShell></ToastProvider>;
}
