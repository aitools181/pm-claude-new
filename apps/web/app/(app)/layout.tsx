import type { ReactNode } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { ToastProvider } from "../../components/ui/Toast";
import { AppDialogProvider } from "../../components/ui/AppDialog";

/**
 * Every route in this group sits behind the session cookie check in
 * middleware.ts, so none of it can be usefully prerendered at build time.
 * Marking the segment dynamic renders these pages per request and removes the
 * whole class of "useSearchParams() should be wrapped in a suspense boundary"
 * prerender failures that otherwise appear one page at a time in CI/Coolify.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ToastProvider><AppDialogProvider><AppShell>{children}</AppShell></AppDialogProvider></ToastProvider>;
}
