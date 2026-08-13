"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  label: string;
  valueText?: ReactNode;
};

export function Slider({ label, valueText, id, className = "", ...props }: SliderProps) {
  const generated = useId().replace(/:/g, "");
  const controlId = id || `slider-${generated}`;
  return (
    <label className={`ui-slider ${className}`.trim()} htmlFor={controlId}>
      <span className="ui-slider-label"><span>{label}</span>{valueText !== undefined ? <strong>{valueText}</strong> : null}</span>
      <input {...props} id={controlId} type="range" />
    </label>
  );
}
