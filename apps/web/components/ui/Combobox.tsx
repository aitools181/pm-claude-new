"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Spinner } from "./Display";

type Option = { value: string; label: string; description?: string; disabled?: boolean };

type ComboboxProps = {
  label: string;
  options: Option[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  error?: string;
  allowFreeText?: boolean;
  disabled?: boolean;
  className?: string;
};

export function Combobox({
  label,
  options,
  value,
  onValueChange,
  placeholder = "Search…",
  loading = false,
  error,
  allowFreeText = false,
  disabled = false,
  className = "",
}: ComboboxProps) {
  const id = useId().replace(/:/g, "");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => options.find((option) => option.value === value)?.label || value || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((option) => `${option.label} ${option.description || ""}`.toLowerCase().includes(q))
      : options;
  }, [options, query]);

  const enabledIndexes = useMemo(
    () => filtered.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled).map(({ index }) => index),
    [filtered],
  );

  useEffect(() => {
    const selected = options.find((option) => option.value === value);
    setQuery(selected?.label || value || "");
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    setActive((current) => enabledIndexes.includes(current) ? current : (enabledIndexes[0] ?? -1));
  }, [enabledIndexes, open]);

  const choose = (option: Option) => {
    if (option.disabled) return;
    setQuery(option.label);
    onValueChange(option.value);
    setOpen(false);
    requestAnimationFrame(() => input.current?.focus());
  };

  const move = (direction: 1 | -1) => {
    if (!enabledIndexes.length) return;
    setOpen(true);
    setActive((current) => {
      const currentEnabled = enabledIndexes.indexOf(current);
      if (currentEnabled < 0) return direction === 1 ? enabledIndexes[0]! : enabledIndexes[enabledIndexes.length - 1]!;
      return enabledIndexes[(currentEnabled + direction + enabledIndexes.length) % enabledIndexes.length]!;
    });
  };

  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter" && open && active >= 0 && filtered[active]) {
      event.preventDefault();
      choose(filtered[active]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Home" && open && enabledIndexes.length) {
      event.preventDefault();
      setActive(enabledIndexes[0]!);
    } else if (event.key === "End" && open && enabledIndexes.length) {
      event.preventDefault();
      setActive(enabledIndexes[enabledIndexes.length - 1]!);
    }
  };

  const listId = `combo-${id}-list`;
  const errorId = error ? `combo-${id}-error` : undefined;
  const activeOptionId = open && active >= 0 && filtered[active] && !filtered[active]?.disabled
    ? `combo-${id}-option-${active}`
    : undefined;

  return (
    <div
      ref={root}
      className={`ui-combobox ${className}`.trim()}
      data-invalid={error ? "true" : undefined}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={`combo-${id}`}>{label}</label>
      <div className="ui-combobox-control">
        <input
          ref={input}
          id={`combo-${id}`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeOptionId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          aria-busy={loading || undefined}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => { if (!disabled) setOpen(true); }}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            setActive(-1);
            if (allowFreeText) onValueChange(next);
          }}
          onKeyDown={key}
        />
        {loading ? <Spinner label="Searching" /> : query ? (
          <button
            type="button"
            aria-label="Clear selection"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              onValueChange("");
              setOpen(true);
              setActive(-1);
              input.current?.focus();
            }}
          >×</button>
        ) : null}
      </div>
      {error ? <span id={errorId} className="field-error" role="alert">{error}</span> : null}
      {open ? (
        <div id={listId} className="ui-combobox-list" role="listbox" aria-label={`${label} options`}>
          {loading ? <div className="ui-combobox-state" role="status">Searching…</div> : error ? (
            <div className="ui-combobox-state" role="alert">Unable to load options.</div>
          ) : filtered.length ? filtered.map((option, index) => (
            <button
              key={option.value}
              id={`combo-${id}-option-${index}`}
              type="button"
              role="option"
              aria-selected={value === option.value}
              disabled={option.disabled}
              data-active={index === active || undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => { if (!option.disabled) setActive(index); }}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          )) : <div className="ui-combobox-state" role="status">No results</div>}
        </div>
      ) : null}
    </div>
  );
}
