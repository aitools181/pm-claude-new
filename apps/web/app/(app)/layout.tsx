import type { ReactNode } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { ToastProvider } from "../../components/ui/Toast";
import { AppDialogProvider } from "../../components/ui/AppDialog";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ToastProvider><AppDialogProvider><AppShell>{children}</AppShell></AppDialogProvider></ToastProvider>;
}
