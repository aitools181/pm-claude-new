"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "./Button";
import { Field, Input } from "./Field";
import { useModalDialog } from "./useModalDialog";

type PromptOptions = {
  title?: string;
  label?: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "password" | "email" | "url" | "number" | "date";
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
};

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PromptRequest = {
  kind: "prompt";
  message: string;
  options: PromptOptions;
  resolve: (value: string | null) => void;
};

type ConfirmRequest = {
  kind: "confirm";
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type DialogRequest = PromptRequest | ConfirmRequest;

type RequestSink = (request: DialogRequest) => void;
let sink: RequestSink | null = null;
const beforeMount: DialogRequest[] = [];

function enqueue(request: DialogRequest) {
  if (sink) sink(request);
  else beforeMount.push(request);
}

function inferredConfirmLabel(message: string) {
  const text = message.toLowerCase();
  if (/permanently delete|delete\b/.test(text)) return "Delete";
  if (/remove\b/.test(text)) return "Remove";
  if (/merge\b/.test(text)) return "Merge";
  if (/revoke\b/.test(text)) return "Revoke";
  if (/archive\b/.test(text)) return "Archive";
  if (/discard\b/.test(text)) return "Discard";
  return "Confirm";
}

function isDestructiveMessage(message: string) {
  return /delete|remove|merge|revoke|discard|cannot be undone|permanent/i.test(message);
}

function inferredPromptType(message: string): PromptOptions["inputType"] {
  if (/secret|password/i.test(message)) return "password";
  if (/e-?mail|email address|which address/i.test(message)) return "email";
  if (/\burl\b|image url|file ref/i.test(message)) return "url";
  if (/date \(yyyy-mm-dd\)/i.test(message)) return "date";
  return "text";
}

/**
 * Product-owned replacement for window.prompt().
 * Use the string signature for quick migration or the options object for a fully named field.
 */
export function appPrompt(message: string, defaultValueOrOptions: string | PromptOptions = ""): Promise<string | null> {
  const options: PromptOptions = typeof defaultValueOrOptions === "string"
    ? { defaultValue: defaultValueOrOptions }
    : defaultValueOrOptions;
  return new Promise((resolve) => enqueue({ kind: "prompt", message, options, resolve }));
}

/** Product-owned replacement for window.confirm(). */
export function appConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => enqueue({ kind: "confirm", message, options, resolve }));
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const queueRef = useRef<DialogRequest[]>([]);
  const current = queue[0] ?? null;
  queueRef.current = queue;

  useEffect(() => {
    sink = (request) => setQueue((items) => [...items, request]);
    if (beforeMount.length) {
      const pending = beforeMount.splice(0, beforeMount.length);
      setQueue((items) => [...items, ...pending]);
    }
    return () => {
      sink = null;
      // Resolve any abandoned requests safely if the provider unmounts during navigation.
      queueRef.current.forEach((item) => { if (item.kind === "prompt") item.resolve(null); else item.resolve(false); });
      queueRef.current = [];
    };
  }, []);

  const finish = (value: string | null | boolean) => {
    const first = queueRef.current[0];
    if (first) {
      if (first.kind === "prompt") first.resolve(typeof value === "string" ? value : null);
      else first.resolve(value === true);
    }
    setQueue((items) => items.slice(1));
  };

  return (
    <>
      {children}
      {current ? <AppDialog request={current} onFinish={finish} /> : null}
    </>
  );
}

function AppDialog({ request, onFinish }: { request: DialogRequest; onFinish: (value: string | null | boolean) => void }) {
  const isPrompt = request.kind === "prompt";
  const promptOptions = isPrompt ? request.options : undefined;
  const confirmOptions = request.kind === "confirm" ? request.options : undefined;
  const [value, setValue] = useState(promptOptions?.defaultValue ?? "");
  const close = () => onFinish(isPrompt ? null : false);
  const ref = useModalDialog(true, close, isPrompt ? "[data-app-dialog-input]" : "[data-app-dialog-confirm]");

  useEffect(() => {
    setValue(promptOptions?.defaultValue ?? "");
  }, [request, promptOptions?.defaultValue]);

  const destructive = request.kind === "confirm" && (confirmOptions?.destructive ?? isDestructiveMessage(request.message));
  const title = useMemo(() => {
    if (isPrompt) return promptOptions?.title || "Enter details";
    return confirmOptions?.title || (destructive ? "Confirm destructive action" : "Confirm action");
  }, [confirmOptions?.title, destructive, isPrompt, promptOptions?.title, request.message]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isPrompt) {
      if (promptOptions?.required && !value.trim()) return;
      onFinish(value);
    } else {
      onFinish(true);
    }
  }

  const description = isPrompt ? promptOptions?.description : confirmOptions?.description || request.message;
  const label = promptOptions?.label || request.message;

  return (
    <div className="modal-backdrop ui-app-dialog-backdrop" aria-hidden={false}>
      <form
        ref={ref as RefObject<HTMLFormElement>}
        className="modal-card ui-app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={description ? "app-dialog-description" : undefined}
        tabIndex={-1}
        onSubmit={submit}
      >
        <div className="modal-title-row ui-app-dialog-head">
          <h2 id="app-dialog-title">{title}</h2>
        </div>
        {description && (!isPrompt || promptOptions?.title) ? (
          <p className="ui-app-dialog-description" id="app-dialog-description">{description}</p>
        ) : null}
        {isPrompt ? (
          <Field label={label || "Value"} required={promptOptions?.required}>
            <Input
              data-app-dialog-input
              type={promptOptions?.inputType ?? inferredPromptType(request.message)}
              value={value}
              placeholder={promptOptions?.placeholder}
              onChange={(event) => setValue(event.target.value)}
              autoComplete={(promptOptions?.inputType ?? inferredPromptType(request.message)) === "password" ? "new-password" : "off"}
            />
          </Field>
        ) : null}
        <div className="modal-actions ui-app-dialog-actions">
          <Button variant="secondary" onClick={close}>{(isPrompt ? promptOptions?.cancelLabel : confirmOptions?.cancelLabel) || "Cancel"}</Button>
          <Button
            data-app-dialog-confirm
            type="submit"
            variant={destructive ? "destructive" : "primary"}
            disabled={Boolean(isPrompt && promptOptions?.required && !value.trim())}
          >
            {(isPrompt ? promptOptions?.confirmLabel : confirmOptions?.confirmLabel) || (isPrompt ? "Continue" : inferredConfirmLabel(request.message))}
          </Button>
        </div>
      </form>
    </div>
  );
}
