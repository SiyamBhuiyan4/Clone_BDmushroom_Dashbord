import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Minus, Plus, X } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  // The gradient itself is applied as an inline style. An arbitrary background
  // utility pointing at a custom property compiles to background-color, which
  // silently drops the gradient.
  primary: "text-white shadow-[var(--shadow-hero)] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-surface text-ink border border-line-strong shadow-[var(--shadow-sm)] " +
    "hover:bg-surface-2 active:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger:
    "bg-critical-solid text-white shadow-[var(--shadow-sm)] hover:brightness-110 active:brightness-95",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      style={variant === "primary" ? { background: "var(--grad-violet)", ...style } : style}
      className={cx(
        "ac-press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-9 px-3 text-[13px]" : "h-11 px-4.5 text-[14px]",
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  /** Makes the whole card a single click target — its own buttons still need `stopPropagation`. */
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      className={cx(
        "rounded-card border border-line bg-surface shadow-[var(--shadow-card)]",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Small text button used inside card headers ("View all", "Show table"). */
export function CardAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent-soft"
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- Inputs */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-[12px] leading-4.5 text-ink-3">{hint}</p>}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-line-strong bg-page px-3.5 text-[14px] text-ink " +
  "placeholder:text-ink-3 transition-all focus:border-accent focus:outline-none " +
  "focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-50";

/*
  Typed as the element's own props rather than only its attributes, so `ref`
  comes through — React 19 passes it like any other prop. A caller that has to
  move focus back into a field (a passcode retry, say) needs the handle.
*/
export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input {...rest} className={cx(CONTROL, "h-11", className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(CONTROL, "resize-y py-3 leading-6", className)} />;
}

/** Select with the OS chevron replaced by our own, so it matches every theme. */
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select {...rest} className={cx(CONTROL, "h-11 cursor-pointer pr-10", className)} />
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
    </div>
  );
}

/**
 * Quantity control. A bare number input invites typing "0" or "-3" and shows
 * native spinners; this keeps the value in range and reads as one object.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, n));
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className="flex h-11 items-center rounded-xl border border-line-strong bg-page">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={atMin}
        aria-label={`Decrease ${label}`}
        className="flex h-full w-11 shrink-0 items-center justify-center rounded-l-xl text-ink-3 transition-colors hover:text-ink disabled:opacity-30"
      >
        <Minus size={15} />
      </button>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={1}
        aria-label={label}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChange(e.target.value === "" ? NaN : clamp(Math.round(next)));
        }}
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-center text-[15px] font-bold tabular-nums text-ink focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(clamp((Number.isFinite(value) ? value : min) + 1))}
        disabled={atMax}
        aria-label={`Increase ${label}`}
        className="flex h-full w-11 shrink-0 items-center justify-center rounded-r-xl text-ink-3 transition-colors hover:text-ink disabled:opacity-30"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

/**
 * The amount field a dialog is really about. Oversized on purpose — in a sheet
 * with eight inputs, the one that decides the outcome should not look like the
 * other seven.
 */
export function AmountInput({
  symbol,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { symbol: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-page px-4 py-3 transition-all focus-within:border-accent focus-within:ring-4 focus-within:ring-[var(--ring)]">
      <span className="text-[24px] leading-8 font-bold text-ink-3">{symbol}</span>
      <input
        {...rest}
        type="number"
        step="any"
        min="0"
        inputMode="decimal"
        className={cx(
          "min-w-0 flex-1 border-0 bg-transparent text-[26px] leading-8 font-bold tracking-tight",
          "text-ink tabular-nums placeholder:text-ink-3 focus:outline-none",
          className,
        )}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- Badge */

const BADGE_TONES: Record<string, string> = {
  neutral: "bg-surface-2 text-ink-2",
  good: "bg-good-soft text-good-ink",
  warning: "bg-warning-soft text-warning-ink",
  critical: "bg-critical-soft text-critical-ink",
  accent: "bg-accent-soft text-accent",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Modal */

/*
  Every open dialog, innermost last. Escape is listened for on the document,
  so without somewhere to ask "am I the top one?" each open dialog would
  answer the same key press.
*/
const OPEN_MODALS: object[] = [];

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  gradient = "var(--grad-violet)",
  children,
  width = "sm:max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Anchors the header — a dialog with no visual subject reads as a form dump. */
  icon?: ReactNode;
  gradient?: string;
  children: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /*
    Held in a ref so the effect below keys on `open` alone. Callers pass an
    inline arrow for `onClose`, which is a fresh function on every render of
    the page holding the dialog — as a dependency it tore the whole thing down
    and set it up again each time, and the setup ends by moving focus. Opening
    a lot on the Products page re-rendered it on every query update, so typing
    into a dialog kept losing the caret to the panel behind it.
  */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  /** Identity for the stack below; the object itself is never read. */
  const idRef = useRef({});

  useEffect(() => {
    if (!open) return;

    const id = idRef.current;
    OPEN_MODALS.push(id);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the dialog on top answers. Otherwise one press dismisses the
      // sheet and the dialog it was opened from, together.
      if (OPEN_MODALS[OPEN_MODALS.length - 1] !== id) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);

    /*
      Locking the body scroll removes the scrollbar, which widens the page and
      makes the whole layout jump sideways. Measure the scrollbar first and
      give the body that much padding so the swap is invisible.
    */
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const current = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${current + scrollbarWidth}px`;
    }

    // Return focus to whatever opened the dialog once it closes.
    const opener = document.activeElement as HTMLElement | null;
    /*
      A field first, and only then a button. `querySelector` with a comma list
      returns whatever comes first in the document, and the header's close
      button precedes every field — so this used to open each dialog with the
      X focused, quietly overriding React's own autoFocus. Typing went
      nowhere and Enter dismissed the dialog instead of submitting it.
    */
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>("[autofocus]") ??
      panel?.querySelector<HTMLElement>("input:not([type='hidden']), textarea, select") ??
      panel?.querySelector<HTMLElement>("button");
    target?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      const at = OPEN_MODALS.lastIndexOf(id);
      if (at !== -1) OPEN_MODALS.splice(at, 1);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  /*
    Rendered into <body>. Inside the page tree any ancestor with a transform —
    the route's entrance animation, a card's hover lift — becomes the
    containing block for `position: fixed`, which pins the dialog to that
    element instead of the viewport.
  */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="ac-fade-in fixed inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "ac-pop-in relative flex max-h-full w-full flex-col rounded-[24px] border border-line",
          "bg-surface shadow-[var(--shadow-pop)]",
          width,
        )}
      >
        <div className="relative shrink-0 overflow-hidden rounded-t-[24px] border-b border-line">
          {/* A wash of the accent so the header reads as a surface, not a rule. */}
          <div
            className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full opacity-[0.13] blur-3xl"
            style={{ background: gradient }}
            aria-hidden
          />
          <div className="relative flex items-start gap-3.5 px-6 py-5">
            {icon && (
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-hero)]"
                style={{ background: gradient }}
                aria-hidden
              >
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-[19px] leading-7 font-bold tracking-tight text-ink">{title}</h2>
              {subtitle && <p className="mt-1 text-[13px] leading-5 text-ink-3">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 shrink-0 rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Action bar for a dialog. It lives inside the dialog's scroll area (it is
 * part of the form), so it is sticky — otherwise a tall form pushes the
 * primary button below the fold and the dialog looks broken.
 */
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2.5 rounded-b-[24px] border-t border-line bg-page px-6 py-4">
      {children}
    </div>
  );
}

/** Small caps section heading, for grouping fields inside a dialog. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">{children}</p>
  );
}

/* ------------------------------------------------------------ Empty state */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div
        className="flex size-14 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-hero)]"
        style={{ background: "var(--grad-violet)" }}
      >
        {icon}
      </div>
      <div>
        <p className="text-[16px] font-bold tracking-tight text-ink">{title}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-6 text-ink-3">{body}</p>
      </div>
      {action}
    </div>
  );
}
