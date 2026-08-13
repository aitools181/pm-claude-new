"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export function Toggle({ pressed, onPressedChange, children, className = "", disabled = false }: { pressed: boolean; onPressedChange: (pressed: boolean) => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return <button type="button" className={`ui-toggle ${className}`.trim()} aria-pressed={pressed} data-pressed={pressed || undefined} disabled={disabled} onClick={() => onPressedChange(!pressed)}>{children}</button>;
}

export function ToggleGroup<T extends string>({ value, options, onValueChange, ariaLabel, className = "" }: { value: T; options: Array<{ value: T; label: ReactNode; disabled?: boolean }>; onValueChange: (value: T) => void; ariaLabel: string; className?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const pos = enabled.findIndex((entry) => entry.index === index);
    let next = pos;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (pos + 1) % enabled.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (pos - 1 + enabled.length) % enabled.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    onValueChange(target.option.value);
    refs.current[target.index]?.focus();
  }
  return (
    <div className={`ui-toggle-group ${className}`.trim()} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => <button key={option.value} ref={(node) => { refs.current[index] = node; }} type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} data-pressed={value === option.value || undefined} disabled={option.disabled} onClick={() => onValueChange(option.value)} onKeyDown={(event) => onKeyDown(event, index)}>{option.label}</button>)}
    </div>
  );
}
