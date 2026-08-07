// Offline draft/action queue backed by localStorage. Flushes when back online,
// surfaces server rejections as explicit conflicts for the user to resolve.
export type QueuedAction = {
  id: string;
  type: "createWorkItem";
  payload: { projectId: string; title: string };
  status: "pending" | "conflict";
  error?: string;
  createdAt: string;
};

const KEY = "pm_offline_queue";
const read = (): QueuedAction[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const write = (q: QueuedAction[]) => localStorage.setItem(KEY, JSON.stringify(q));

export const getQueue = (): QueuedAction[] => (typeof localStorage === "undefined" ? [] : read());
export function enqueue(type: QueuedAction["type"], payload: QueuedAction["payload"]): QueuedAction {
  const action: QueuedAction = { id: crypto.randomUUID(), type, payload, status: "pending", createdAt: new Date().toISOString() };
  write([...read(), action]); return action;
}
export function updateAction(id: string, patch: Partial<QueuedAction>) { write(read().map((a) => (a.id === id ? { ...a, ...patch } : a))); }
export function removeAction(id: string) { write(read().filter((a) => a.id !== id)); }

/** Replay pending actions. `send` throws on failure → the action is marked conflict. */
export async function flush(send: (a: QueuedAction) => Promise<void>): Promise<{ synced: number; conflicts: number }> {
  let synced = 0, conflicts = 0;
  for (const a of read()) {
    if (a.status === "conflict") continue;
    try { await send(a); removeAction(a.id); synced++; }
    catch (e) { updateAction(a.id, { status: "conflict", error: e instanceof Error ? e.message : "sync failed" }); conflicts++; }
  }
  return { synced, conflicts };
}
