"use client";
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
export function InputOTP({ value, onChange, length = 6, label = "One-time code", disabled = false }: { value: string; onChange: (value: string) => void; length?: number; label?: string; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]); const chars = Array.from({ length }, (_, i) => value[i] || "");
  const write = (index: number, next: string) => { const clean = next.replace(/\D/g, "").slice(-1); const arr = chars.slice(); arr[index] = clean; onChange(arr.join("").slice(0, length)); if (clean && index < length - 1) refs.current[index + 1]?.focus(); };
  const key = (e: KeyboardEvent<HTMLInputElement>, i: number) => { if (e.key === "Backspace" && !chars[i] && i > 0) refs.current[i - 1]?.focus(); if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus(); if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus(); };
  const paste = (e: ClipboardEvent<HTMLInputElement>) => { const clean = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length); if (!clean) return; e.preventDefault(); onChange(clean); refs.current[Math.min(clean.length, length) - 1]?.focus(); };
  return <fieldset className="ui-otp"><legend>{label}</legend><div>{chars.map((char, i) => <input key={i} ref={(node) => { refs.current[i] = node; }} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`${label} digit ${i + 1}`} value={char} disabled={disabled} onChange={(e) => write(i, e.target.value)} onKeyDown={(e) => key(e, i)} onPaste={paste} maxLength={1} />)}</div></fieldset>;
}
