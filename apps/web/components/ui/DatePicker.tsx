"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Icon } from "./Icon";

function iso(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromIso(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m! - 1 ||
    date.getDate() !== d
  ) return null;
  return date;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonthsClamped(date: Date, amount: number) {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

type CalendarProps = {
  value?: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  isDateDisabled?: (value: string) => boolean;
  locale?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
};

export function Calendar({
  value,
  onValueChange,
  min,
  max,
  isDateDisabled,
  locale,
  autoFocus = false,
  ariaLabel = "Choose date",
}: CalendarProps) {
  const selected = fromIso(value);
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() =>
    selected
      ? new Date(selected.getFullYear(), selected.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [focusedDate, setFocusedDate] = useState(() => iso(selected || today));
  const dayRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const shouldFocus = useRef(autoFocus);

  useEffect(() => {
    if (!selected) return;
    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setFocusedDate(iso(selected));
  }, [value]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  const isDisabled = (dateIso: string) =>
    Boolean((min && dateIso < min) || (max && dateIso > max) || isDateDisabled?.(dateIso));

  const firstEnabled = useMemo(() => {
    const inCurrentMonth = cells.find((date) => date.getMonth() === month.getMonth() && !isDisabled(iso(date)));
    return inCurrentMonth || cells.find((date) => !isDisabled(iso(date))) || null;
  }, [cells, month, min, max, isDateDisabled]);

  const tabStop = useMemo(() => {
    if (value && cells.some((date) => iso(date) === value) && !isDisabled(value)) return value;
    if (cells.some((date) => iso(date) === focusedDate) && !isDisabled(focusedDate)) return focusedDate;
    return firstEnabled ? iso(firstEnabled) : undefined;
  }, [cells, value, focusedDate, firstEnabled, min, max, isDateDisabled]);

  useEffect(() => {
    if (!shouldFocus.current || !tabStop) return;
    shouldFocus.current = false;
    requestAnimationFrame(() => dayRefs.current[tabStop]?.focus());
  }, [tabStop, month]);

  const moveFocus = (target: Date, direction = 1) => {
    let candidate = target;
    for (let i = 0; i < 62; i += 1) {
      const candidateIso = iso(candidate);
      if (!isDisabled(candidateIso)) {
        setFocusedDate(candidateIso);
        if (candidate.getMonth() !== month.getMonth() || candidate.getFullYear() !== month.getFullYear()) {
          setMonth(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
          shouldFocus.current = true;
        } else {
          requestAnimationFrame(() => dayRefs.current[candidateIso]?.focus());
        }
        return;
      }
      candidate = addDays(candidate, direction);
    }
  };

  const onDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(addDays(date, 1), 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(addDays(date, -1), -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(addDays(date, 7), 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(addDays(date, -7), -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const rowStart = index - (index % 7);
      const target = cells.slice(rowStart, rowStart + 7).find((candidate) => !isDisabled(iso(candidate)));
      if (target) moveFocus(target, 1);
    } else if (event.key === "End") {
      event.preventDefault();
      const rowStart = index - (index % 7);
      const target = [...cells.slice(rowStart, rowStart + 7)].reverse().find((candidate) => !isDisabled(iso(candidate)));
      if (target) moveFocus(target, -1);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const direction = event.key === "PageUp" ? -1 : 1;
      const amount = event.shiftKey ? direction * 12 : direction;
      moveFocus(addMonthsClamped(date, amount), direction);
    }
  };

  const formatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    [locale],
  );

  return (
    <div className="ui-calendar" role="group" aria-label={ariaLabel}>
      <header>
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <strong aria-live="polite">
          {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month)}
        </strong>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </header>
      <div className="ui-calendar-weekdays" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>
            {new Intl.DateTimeFormat(locale, { weekday: "short" })
              .format(new Date(2026, 0, 4 + i))
              .slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="ui-calendar-grid" role="grid" aria-label={ariaLabel}>
        {cells.map((date, index) => {
          const dateIso = iso(date);
          const disabled = isDisabled(dateIso);
          const outside = date.getMonth() !== month.getMonth();
          const isToday = dateIso === iso(today);
          return (
            <button
              key={dateIso}
              ref={(node) => { dayRefs.current[dateIso] = node; }}
              type="button"
              role="gridcell"
              aria-label={formatter.format(date)}
              aria-selected={value === dateIso}
              aria-current={isToday ? "date" : undefined}
              disabled={disabled}
              tabIndex={dateIso === tabStop ? 0 : -1}
              data-outside={outside || undefined}
              data-today={isToday || undefined}
              onFocus={() => setFocusedDate(dateIso)}
              onKeyDown={(event) => onDayKeyDown(event, date, index)}
              onClick={() => onValueChange(dateIso)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type DatePickerProps = {
  label: string;
  value?: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  isDateDisabled?: (value: string) => boolean;
  disabled?: boolean;
  error?: string;
  locale?: string;
  className?: string;
};

export function DatePicker({
  label,
  value,
  onValueChange,
  min,
  max,
  isDateDisabled,
  disabled = false,
  error,
  locale,
  className = "",
}: DatePickerProps) {
  const id = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || "");

  useEffect(() => setText(value || ""), [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const commit = () => {
    const parsed = fromIso(text);
    if (!parsed) return;
    const next = iso(parsed);
    if ((min && next < min) || (max && next > max) || isDateDisabled?.(next)) return;
    onValueChange(next);
  };

  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && event.altKey) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Enter") {
      commit();
    }
  };

  const popoverId = `date-${id}-calendar`;
  return (
    <div
      ref={rootRef}
      className={`ui-date-picker ${className}`.trim()}
      data-invalid={error ? "true" : undefined}
    >
      <label htmlFor={`date-${id}`}>{label}</label>
      <div className="ui-date-picker-control">
        <input
          id={`date-${id}`}
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          value={text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `date-${id}-error` : undefined}
          aria-controls={open ? popoverId : undefined}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={key}
        />
        <button
          ref={triggerRef}
          type="button"
          aria-label="Open calendar"
          aria-haspopup="dialog"
          aria-controls={popoverId}
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Icon name="calendar" size={20} />
        </button>
      </div>
      {error ? <span id={`date-${id}-error`} className="field-error">{error}</span> : null}
      {open ? (
        <div id={popoverId} className="ui-date-picker-popover" role="dialog" aria-label={`Choose ${label}`}>
          <Calendar
            value={value}
            onValueChange={(next) => {
              onValueChange(next);
              setText(next);
              setOpen(false);
              requestAnimationFrame(() => triggerRef.current?.focus());
            }}
            min={min}
            max={max}
            isDateDisabled={isDateDisabled}
            locale={locale}
            autoFocus
            ariaLabel={`Choose ${label}`}
          />
        </div>
      ) : null}
    </div>
  );
}
