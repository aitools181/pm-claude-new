"use client";

import { type ComponentPropsWithoutRef, type ElementType, type RefObject, useLayoutEffect, useRef } from "react";

export type RuntimeCssVars = Record<`--${string}`, string | number | null | undefined>;

/** Apply approved runtime CSS custom properties to an existing DOM ref. */
export function useRuntimeCssVars<T extends HTMLElement | SVGElement>(ref: RefObject<T | null>, vars: RuntimeCssVars) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const entries = Object.entries(vars);
    for (const [name, value] of entries) {
      if (value === undefined || value === null || value === "") node.style.removeProperty(name);
      else node.style.setProperty(name, String(value));
    }
    return () => {
      for (const [name] of entries) node.style.removeProperty(name);
    };
  }, [ref, vars]);
}

type RuntimeStyleProps<T extends ElementType> = {
  as?: T;
  vars: RuntimeCssVars;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "style">;

/**
 * Controlled boundary for data-driven visual values.
 *
 * Components provide only CSS custom-property values (progress, coordinates,
 * measured sizes, or user-selected colors). All visual property declarations
 * stay in CSS. This prevents ad-hoc React style objects from spreading across
 * screens while preserving runtime geometry that cannot be static.
 */
export function RuntimeStyle<T extends ElementType = "div">({ as, vars, ...props }: RuntimeStyleProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement | SVGElement | null>(null);
  useRuntimeCssVars(ref, vars);
  return <Tag ref={ref} {...props} />;
}
