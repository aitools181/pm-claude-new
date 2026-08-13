"use client";

import { useId, type MouseEvent, type ReactNode } from "react";
import { IconButton } from "./Button";
import { useModalDialog } from "./useModalDialog";

type DialogSize = "small" | "default" | "large";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
  className = "",
  initialFocusSelector,
  closeOnBackdrop = true,
  role = "dialog",
  closeLabel = "Close dialog",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  className?: string;
  initialFocusSelector?: string;
  closeOnBackdrop?: boolean;
  role?: "dialog" | "alertdialog";
  closeLabel?: string;
}) {
  const reactId = useId().replace(/:/g, "");
  const titleId = `dialog-${reactId}-title`;
  const descriptionId = description ? `dialog-${reactId}-description` : undefined;
  const dialogRef = useModalDialog<HTMLDivElement>(open, onClose, initialFocusSelector);
  if (!open) return null;

  function backdrop(event: MouseEvent<HTMLDivElement>) {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose();
  }

  return (
    <div className="modal-backdrop ui-dialog-backdrop" onMouseDown={backdrop}>
      <div
        ref={dialogRef}
        className={`modal-card ui-dialog ${className}`.trim()}
        data-size={size}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="modal-title-row ui-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <IconButton label={closeLabel} icon="close" onClick={onClose} />
        </div>
        <div className="ui-dialog-body">{children}</div>
        {footer ? <div className="modal-actions ui-dialog-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
