"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className = "",
  actions,
}: {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  actions?: ReactNode;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled);

  function move(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    if (!enabled.length) return;
    const currentEnabledIndex = enabled.findIndex(({ index }) => index === currentIndex);
    let nextEnabledIndex = currentEnabledIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextEnabledIndex = (currentEnabledIndex + 1) % enabled.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextEnabledIndex = (currentEnabledIndex - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") nextEnabledIndex = 0;
    else if (event.key === "End") nextEnabledIndex = enabled.length - 1;
    else return;
    event.preventDefault();
    const next = enabled[nextEnabledIndex];
    if (!next) return;
    onValueChange(next.item.value);
    refs.current[next.index]?.focus();
  }

  return (
    <div className={`ui-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          key={item.value}
          ref={(node) => { refs.current[index] = node; }}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          tabIndex={value === item.value ? 0 : -1}
          data-active={value === item.value}
          disabled={item.disabled}
          onClick={() => onValueChange(item.value)}
          onKeyDown={(event) => move(event, index)}
        >
          {item.label}
        </button>
      ))}
      {actions ? <span className="ui-tabs-actions" role="presentation">{actions}</span> : null}
    </div>
  );
}
