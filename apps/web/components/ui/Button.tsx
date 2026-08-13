import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
type ButtonSize = "compact" | "default" | "large";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  children?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "default",
  loading = false,
  leadingIcon,
  trailingIcon,
  className = "",
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    "ui-button",
    variant === "primary" ? "btn-primary" : variant === "destructive" ? "btn-danger" : variant === "tertiary" ? "btn-ghost" : "",
    size === "compact" ? "btn-small" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      className={classes}
      data-variant={variant}
      data-size={size === "compact" ? "compact" : size === "large" ? "large" : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : leadingIcon ? <Icon name={leadingIcon} size={18} /> : null}
      {children}
      {!loading && trailingIcon ? <Icon name={trailingIcon} size={18} /> : null}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  className = "",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & { label: string; icon: IconName }) {
  return <button type={props.type ?? "button"} className={`icon-btn ${className}`.trim()} aria-label={label} title={label} {...props}><Icon name={icon} size={18} /></button>;
}
