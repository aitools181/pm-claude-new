import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  required?: boolean;
};

export function Label({ htmlFor, children, className = "" }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return <label className={`field-label ui-label ${className}`.trim()} htmlFor={htmlFor}>{children}</label>;
}

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Shared field anatomy for all form controls.
 * Keeps the label persistent, associates helper/error text programmatically,
 * and preserves geometry when validation is added.
 */
export function Field({ label, hint, error, required, optional, htmlFor, className = "", children }: FieldProps) {
  const reactId = useId().replace(/:/g, "");
  const onlyChild = Children.count(children) === 1 && isValidElement<FieldControlProps>(children)
    ? children as ReactElement<FieldControlProps>
    : null;
  const generatedControlId = `field-${reactId}`;
  const controlId = htmlFor || onlyChild?.props.id || (onlyChild ? generatedControlId : undefined);
  const messageBaseId = controlId || generatedControlId;
  const hintId = hint ? `${messageBaseId}-hint` : undefined;
  const errorId = error ? `${messageBaseId}-error` : undefined;
  const describedBy = [onlyChild?.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = onlyChild
    ? cloneElement(onlyChild, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : onlyChild.props["aria-invalid"],
        required: required ?? onlyChild.props.required,
      })
    : children;

  return (
    <div className={`field ui-field ${className}`.trim()} data-invalid={error ? "true" : undefined}>
      <label className="field-label" htmlFor={controlId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {optional && !required ? <span className="field-optional"> (optional)</span> : null}
      </label>
      {control}
      {hint && <span className="hint field-hint" id={hintId}>{hint}</span>}
      {error && <span className="field-error" id={errorId} role="alert">{error}</span>}
    </div>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ui-input ${className}`.trim()} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ui-textarea ${className}`.trim()} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ui-select ${className}`.trim()} {...props} />;
}

export const NativeSelect = Select;
