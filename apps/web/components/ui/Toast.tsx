"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export type ToastTone = "neutral" | "success" | "warning" | "error";
export type ToastInput = {
  message: string;
  tone?: ToastTone;
  durationMs?: number | null;
  action?: { label: string; run: () => void };
};
type ToastRow = ToastInput & { id: number };

const Ctx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(Ctx);

function ToastItem({ toast, remove }: { toast: ToastRow; remove: (id: number) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duration = toast.durationMs === undefined ? (toast.tone === "error" ? null : 5000) : toast.durationMs;

  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const startTimer = useCallback(() => {
    stopTimer();
    if (duration == null || duration <= 0) return;
    timer.current = setTimeout(() => remove(toast.id), duration);
  }, [duration, remove, stopTimer, toast.id]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  const role = toast.tone === "error" ? "alert" : "status";
  const live = toast.tone === "error" ? "assertive" : "polite";
  return (
    <div
      className="toast"
      data-tone={toast.tone ?? "neutral"}
      role={role}
      aria-live={live}
      aria-atomic="true"
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
      onFocusCapture={stopTimer}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) startTimer();
      }}
    >
      <span className="toast-copy">{toast.message}</span>
      <span className="toast-actions">
        {toast.action && (
          <button onClick={() => { toast.action?.run(); remove(toast.id); }}>{toast.action.label}</button>
        )}
        <button className="toast-dismiss" aria-label="Dismiss notification" onClick={() => remove(toast.id)}>
          <Icon name="close" size={16} />
        </button>
      </span>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRow[]>([]);
  const remove = useCallback((id: number) => setToasts((cur) => cur.filter((x) => x.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => {
      const deduped = cur.filter((row) => row.message !== t.message);
      return [...deduped, { ...t, id }].slice(-3);
    });
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-label="Notifications">
        {toasts.map((t) => <ToastItem key={t.id} toast={t} remove={remove} />)}
      </div>
    </Ctx.Provider>
  );
}
