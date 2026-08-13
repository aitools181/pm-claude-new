import { useId, type InputHTMLAttributes } from "react";

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; description?: string };

export function Checkbox({ label, description, id, className = "", ...props }: ChoiceProps) {
  const reactId = useId().replace(/:/g, "");
  const controlId = id || `checkbox-${reactId}`;
  return <label className={`ui-choice ${className}`.trim()} htmlFor={controlId}><input id={controlId} type="checkbox" {...props} /><span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span></label>;
}

export function Radio({ label, description, id, className = "", ...props }: ChoiceProps) {
  const reactId = useId().replace(/:/g, "");
  const controlId = id || `radio-${reactId}`;
  return <label className={`ui-choice ${className}`.trim()} htmlFor={controlId}><input id={controlId} type="radio" {...props} /><span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span></label>;
}

export function Switch({ label, description, checked, onChange, disabled, id }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; id?: string }) {
  const reactId = useId().replace(/:/g, "");
  const controlId = id || `switch-${reactId}`;
  return <div className="ui-switch-row"><span id={`${controlId}-label`}><strong>{label}</strong>{description ? <small>{description}</small> : null}</span><button id={controlId} type="button" className="ui-switch" role="switch" aria-checked={checked} aria-labelledby={`${controlId}-label`} disabled={disabled} onClick={() => onChange(!checked)}><span /></button></div>;
}

export function RadioGroup({ legend, children, className = "" }: { legend: string; children: React.ReactNode; className?: string }) {
  return <fieldset className={`ui-radio-group ${className}`.trim()}><legend>{legend}</legend>{children}</fieldset>;
}
