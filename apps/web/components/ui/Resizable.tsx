"use client";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { RuntimeStyle } from "./RuntimeStyle";

export function Resizable({ children, defaultSize = 320, min = 160, max = 720, axis = "horizontal", label = "Resize panel", className = "" }: { children: ReactNode; defaultSize?: number; min?: number; max?: number; axis?: "horizontal" | "vertical"; label?: string; className?: string }) {
  const [size, setSize] = useState(defaultSize);
  const drag = useRef<{ start: number; size: number } | null>(null);
  const step = 16;
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: axis === "horizontal" ? event.clientX : event.clientY, size };
  };
  const dragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const cursor = axis === "horizontal" ? event.clientX : event.clientY;
    setSize(clamp(drag.current.size + cursor - drag.current.start));
  };
  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };
  return <RuntimeStyle className={`ui-resizable ${className}`.trim()} data-axis={axis} vars={{ "--ui-resizable-size": `${size}px` }}>
    <div className="ui-resizable-content">{children}</div>
    <div className="ui-resize-handle" role="separator" tabIndex={0} aria-label={label} aria-orientation={axis === "horizontal" ? "vertical" : "horizontal"} aria-valuemin={min} aria-valuemax={max} aria-valuenow={size}
      onPointerDown={startDrag} onPointerMove={dragMove} onPointerUp={stopDrag} onPointerCancel={stopDrag}
      onKeyDown={(event) => {
        const decrease = axis === "horizontal" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
        const increase = axis === "horizontal" ? event.key === "ArrowRight" : event.key === "ArrowDown";
        if (decrease || increase) { event.preventDefault(); setSize((value) => clamp(value + (increase ? step : -step))); }
        if (event.key === "Home") { event.preventDefault(); setSize(min); }
        if (event.key === "End") { event.preventDefault(); setSize(max); }
      }} />
  </RuntimeStyle>;
}
