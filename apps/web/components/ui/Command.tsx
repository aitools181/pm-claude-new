"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Input } from "./Field";

type CommandItem = {
  id: string;
  label: string;
  keywords?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
};

export function Command({
  items,
  onSelect,
  placeholder = "Type a command…",
  ariaLabel = "Commands",
  className = "",
}: {
  items: CommandItem[];
  onSelect: (id: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return q
      ? items.filter((item) => `${item.label} ${item.keywords || ""}`.toLowerCase().includes(q))
      : items;
  }, [items, query]);
  const enabled = useMemo(
    () => filtered.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled).map(({ index }) => index),
    [filtered],
  );

  useEffect(() => {
    setActive((current) => enabled.includes(current) ? current : (enabled[0] ?? -1));
  }, [enabled]);

  const move = (direction: 1 | -1) => {
    if (!enabled.length) return;
    setActive((current) => {
      const position = enabled.indexOf(current);
      if (position < 0) return direction === 1 ? enabled[0]! : enabled[enabled.length - 1]!;
      return enabled[(position + direction + enabled.length) % enabled.length]!;
    });
  };

  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home" && enabled.length) {
      event.preventDefault();
      setActive(enabled[0]!);
    } else if (event.key === "End" && enabled.length) {
      event.preventDefault();
      setActive(enabled[enabled.length - 1]!);
    } else if (event.key === "Enter" && active >= 0 && filtered[active] && !filtered[active]?.disabled) {
      event.preventDefault();
      onSelect(filtered[active]!.id);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  };

  const listId = `command-${id}-list`;
  const activeId = active >= 0 && filtered[active] && !filtered[active]?.disabled ? `command-${id}-option-${active}` : undefined;

  return (
    <div className={`ui-command ${className}`.trim()}>
      <Input
        type="search"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeId}
        placeholder={placeholder}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(-1); }}
        onKeyDown={key}
      />
      <div id={listId} role="listbox" aria-label={ariaLabel}>
        {filtered.length ? filtered.map((item, index) => (
          <button
            key={item.id}
            id={`command-${id}-option-${index}`}
            type="button"
            role="option"
            aria-selected={index === active}
            disabled={item.disabled}
            data-active={index === active || undefined}
            tabIndex={-1}
            onMouseEnter={() => { if (!item.disabled) setActive(index); }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item.id)}
          >
            {item.leading ? <span>{item.leading}</span> : null}
            <span>{item.label}</span>
            {item.trailing ? <span>{item.trailing}</span> : null}
          </button>
        )) : <div className="ui-command-empty" role="status">No matching commands</div>}
      </div>
    </div>
  );
}
