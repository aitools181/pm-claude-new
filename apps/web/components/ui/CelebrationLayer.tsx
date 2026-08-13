"use client";
import { useEffect, useState } from "react";
import { CELEBRATION_EVENT } from "./celebration";

type Burst = { id: number; label: string };
export function CelebrationLayer() {
  const [burst, setBurst] = useState<Burst | null>(null);
  useEffect(() => {
    const onCelebrate = (event: Event) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const label = (event as CustomEvent<{ label?: string }>).detail?.label || "Completed";
      const next = { id: Date.now(), label };
      setBurst(next);
      window.setTimeout(() => setBurst((current) => current?.id === next.id ? null : current), 900);
    };
    window.addEventListener(CELEBRATION_EVENT, onCelebrate);
    return () => window.removeEventListener(CELEBRATION_EVENT, onCelebrate);
  }, []);
  if (!burst) return null;
  return <div className="celebration-layer" aria-hidden="true" key={burst.id}>
    {Array.from({ length: 14 }, (_, i) => <i key={i} data-i={i % 7} />)}
  </div>;
}
