"use client";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "./Button";

export function Carousel({ items, ariaLabel = "Carousel", className = "" }: { items: Array<{ id: string; content: ReactNode; label?: string }>; ariaLabel?: string; className?: string }) {
  const [index, setIndex] = useState(0);
  const id = useId().replace(/:/g, "");
  const count = items.length;
  const safe = Math.min(index, Math.max(0, count - 1));
  const move = (delta: number) => setIndex((current) => count ? (current + delta + count) % count : 0);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "Home" && count) { event.preventDefault(); setIndex(0); }
    if (event.key === "End" && count) { event.preventDefault(); setIndex(count - 1); }
  };
  return <section className={`ui-carousel ${className}`.trim()} aria-roledescription="carousel" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKeyDown}>
    <div className="ui-carousel-stage">{items.map((item, i) => <div key={item.id} id={`carousel-${id}-${i}`} role="group" aria-roledescription="slide" aria-label={item.label || `${i + 1} of ${count}`} hidden={i !== safe}>{item.content}</div>)}</div>
    {count > 1 ? <div className="ui-carousel-controls"><IconButton label="Previous slide" icon="arrowLeft" onClick={() => move(-1)} /><span aria-live="polite">{safe + 1} / {count}</span><IconButton label="Next slide" icon="chevronRight" onClick={() => move(1)} /></div> : null}
  </section>;
}
