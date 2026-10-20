import { useId, type ReactNode } from "react";

/** Open a URL in a new tab. The popup closes itself as Chrome shifts focus. */
export function openTab(url: string) {
  void chrome.tabs.create({ url });
}

/** The popup's outer frame: a titled header over a scroll-bounded body. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-h-[37.5rem] flex-col bg-bg text-ink">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold">Save to Klect</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

/** A centered message panel — the signed-out, unsaveable-page, and cap-hit states. */
export function Notice({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: "primary" | "quiet";
}) {
  const base =
    "rounded-skin px-4 py-2 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50";
  const skin =
    variant === "primary"
      ? "bg-primary text-primary-ink"
      : "border border-border bg-panel text-ink";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${skin}`}>
      {children}
    </button>
  );
}

/** The one label treatment every form row and section heading in the popup shares. */
export const fieldLabelClass = "text-xs font-medium uppercase tracking-wide text-muted";

/** A labelled form row. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={fieldLabelClass}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * A labelled form row whose control is a *group* rather than one focusable input: the
 * star rating, which is ten buttons. `<label htmlFor>` needs a single labelable element,
 * so this uses `role="group"` + `aria-labelledby` instead of pointing a label at nothing.
 */
export function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <p id={labelId} className={fieldLabelClass}>
        {label}
      </p>
      {children}
    </div>
  );
}

/** Shared input/textarea skin. */
export const inputClass =
  "w-full rounded-skin-sm border border-border bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted";

/** An inline failure line. Reportable copy — never the thing the UI branches on. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}
