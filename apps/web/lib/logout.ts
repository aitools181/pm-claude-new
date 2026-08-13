"use client";

import { api } from "./api";
import { disconnectSocket } from "./realtime";

/**
 * Single source of truth for signing out.
 *
 * The session cookie itself is HttpOnly, so only the API can clear it — but the
 * local cleanup below still runs even when the API call fails (expired session,
 * network drop), so the user always lands on /login in a clean state.
 */
export async function signOut(): Promise<void> {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    /* session may already be gone; local cleanup below still applies */
  }
  try { disconnectSocket(); } catch { /* socket may never have connected */ }
  for (const name of ["pm_org", "pm_user_name"]) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
  }
  try { sessionStorage.clear(); } catch { /* storage can be blocked */ }
  window.location.assign("/login");
}
