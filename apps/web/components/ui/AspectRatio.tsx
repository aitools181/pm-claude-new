import type { ReactNode } from "react";
import { RuntimeStyle } from "./RuntimeStyle";

export function AspectRatio({ ratio = 16 / 9, children, className = "" }: { ratio?: number; children: ReactNode; className?: string }) {
  return <RuntimeStyle className={`ui-aspect-ratio ${className}`.trim()} vars={{ "--ui-aspect-ratio": String(ratio) }}>{children}</RuntimeStyle>;
}
