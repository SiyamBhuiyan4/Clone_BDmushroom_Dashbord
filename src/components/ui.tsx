import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
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

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
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

/** How long a dialog's side panel takes to slide in or out — matches `duration-[800ms]` below. */
const ASIDE_MS = 800;

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  iconInteractive = false,
  gradient = "var(--grad-violet)",
  children,
  width = "sm:max-w-xl",
  headerActions,
  asideLeft,
  aside,
  detail,
  stacked,
  onBack,
  guardChanges = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Anchors the header — a dialog with no visual subject reads as a form dump. */
  icon?: ReactNode;
  /** True when `icon` is its own control (e.g. a photo upload button) rather than decoration — keeps it out of the accessibility tree otherwise, same as a background image. */
  iconInteractive?: boolean;
  gradient?: string;
  children: ReactNode;
  width?: string;
  headerActions?: ReactNode;
  /*
    A left-side sliding panel, mirroring how `aside` works on the right.
  */
  asideLeft?: ReactNode;
  /*
    A second panel opened from inside the dialog. On a wide screen it grows in
    beside the dialog, which glides left to make room; on anything narrower it
    slides in over the dialog, and is expected to carry its own back control.
  */
  aside?: ReactNode;
  /*
    A third panel, opened from the side panel. On a wide screen the dialog
    slides out to the left and vanishes, the side panel takes its place, and
    this comes in on the right — closing it plays that backwards. On a narrow
    screen it slides in over everything, like the side panel does.
  */
  detail?: ReactNode;
  /*
    A page opened on top of the dialog: it rises from below into focus while
    the dialog sinks, shrinks and dims behind it — still there, just not the
    point. Closing it plays that backwards.
  */
  stacked?: ReactNode;
  /*
    Steps back one layer — closes whichever of `aside`, `asideLeft`, `detail` or `stacked`
    is on top. While one is open, a click outside the panels or Escape calls
    this instead of closing the whole dialog, so each one backs out a step.
  */
  onBack?: () => void;
  /*
    For a form: once anything has been typed or picked in it, closing by a
    click outside, Escape or the X asks "discard changes?" first. Saving
    still closes it directly — the form calls `onClose` itself for that.
  */
  guardChanges?: boolean;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  /** Identity for the stack below; the object itself is never read. */
  const idRef = useRef({});

  const leftSide = useSlidePanel(asideLeft);
  const side = useSlidePanel(aside);
  const detailPanel = useSlidePanel(detail);
  const stack = useSlidePanel(stacked);

  const rootRef = useRef<HTMLDivElement>(null);
  /** Set by the first edit inside the dialog; cleared each time it opens. */
  const dirtyRef = useRef(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  /** Where the current click began — a drag that starts inside a panel and ends outside it is not a click outside. */
  const downOutsideRef = useRef(false);
  useEffect(() => {
    if (open) {
      dirtyRef.current = false;
      setConfirmingDiscard(false);
    }
  }, [open]);

  /** Closes the dialog, unless that would throw away an edit — then asks first. */
  const requestClose = () => {
    if (guardChanges && dirtyRef.current) setConfirmingDiscard(true);
    else onClose();
  };
  /** One step back: the top side panel if one is open, else the dialog itself. */
  const dismiss = () => {
    if ((aside || asideLeft || detail || stacked) && onBack) onBack();
    else requestClose();
  };
  /*
    Held in a ref so the effect below keys on `open` alone. Callers pass an
    inline arrow for `onClose`, which is a fresh function on every render of
    the page holding the dialog — as a dependency it tore the whole thing down
    and set it up again each time, and the setup ends by moving focus. Opening
    a lot on the Products page re-rendered it on every query update, so typing
    into a dialog kept losing the caret to the panel behind it.
  */
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  /** Which panel is in focus — the one a click anywhere else steps back from. */
  const topLayer = detail ? "detail" : stacked ? "stacked" : aside ? "aside" : asideLeft ? "asideLeft" : "main";
  /**
   * True when the event's DOM target is in a panel of this dialog that is
   * not the one in focus — the profile beside an open dashboard, say.
   */
  const isBehindPanel = (target: EventTarget | null) => {
    const root = rootRef.current;
    if (topLayer === "main" || !root || !(target instanceof Element) || !root.contains(target)) return false;
    const layer = target.closest("[data-modal-layer]")?.getAttribute("data-modal-layer");
    return Boolean(layer && layer !== topLayer && target.closest("[data-modal-panel]"));
  };

  /** True when the event's DOM target sits inside this dialog's own markup, outside every panel. */
  const isOutsidePanels = (target: EventTarget | null) => {
    const root = rootRef.current;
    if (!root || !(target instanceof Node) || !root.contains(target)) return false;
    return !(target instanceof Element && target.closest("[data-modal-panel]"));
  };

  useEffect(() => {
    if (!open) return;

    const id = idRef.current;
    OPEN_MODALS.push(id);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the dialog on top answers. Otherwise one press dismisses the
      // sheet and the dialog it was opened from, together.
      if (OPEN_MODALS[OPEN_MODALS.length - 1] !== id) return;
      dismissRef.current();
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
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      /*
        Anywhere that is not a panel is the backdrop — including the empty
        layout boxes around the panels, which cover the whole screen. The DOM
        check matters: React bubbles events out of a dialog opened from inside
        this one (a passcode prompt, say), and those are not clicks here.
      */
      onMouseDown={(e) => {
        downOutsideRef.current = isOutsidePanels(e.target);
      }}
      /*
        A click on a panel behind the one in focus steps back, like a click
        outside — and does only that, so it can't also press whatever button
        it landed on in the panel behind.
      */
      onClickCapture={(e) => {
        if (!isBehindPanel(e.target)) return;
        e.stopPropagation();
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (downOutsideRef.current && isOutsidePanels(e.target)) dismiss();
        downOutsideRef.current = false;
      }}
      onInput={(e) => {
        if (rootRef.current?.contains(e.target as Node)) dirtyRef.current = true;
      }}
    >
      <div className="ac-fade-in fixed inset-0 bg-scrim" />
      <div className="relative flex h-full max-h-full w-full items-center justify-center">
      <SlidePanel panel={leftSide} layer="z-10" name="asideLeft" position="left" />
      {/* Collapses on a wide screen to make way for `detail`, clipping from the left. */}
      <div
        className={cx(
          "flex h-full max-h-full w-full items-center justify-center",
          (side.mounted || leftSide.mounted) && "xl:w-auto xl:flex-none",
          detailPanel.mounted &&
            "xl:justify-end xl:overflow-hidden transition-[max-width,opacity] duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          detailPanel.mounted && (detailPanel.shown ? "xl:max-w-0 xl:opacity-0" : "xl:max-w-[42rem]"),
          stack.mounted &&
            "origin-top transition-[translate,scale,opacity,filter] duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          stack.shown && "pointer-events-none translate-y-[22vh] scale-[0.9] opacity-45 blur-[1px]",
        )}
        aria-hidden={detailPanel.shown || stack.shown || undefined}
      >
      <div
        ref={panelRef}
        data-modal-panel
        data-modal-layer="main"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "ac-pop-in relative flex max-h-full w-full flex-col rounded-[24px] border border-line",
          "bg-surface shadow-[var(--shadow-pop)]",
          width,
          // Its own width held fixed (the max-width above still caps it), so
          // making room for the panel moves the dialog rather than squeezing it.
          (side.mounted || leftSide.mounted) ? "xl:w-[42rem] xl:flex-none xl:shrink-0" : null,
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
                className={cx(
                  "flex size-11 shrink-0 aspect-square items-center justify-center overflow-hidden rounded-full text-white shadow-[var(--shadow-hero)]",
                  iconInteractive && "ring-2 ring-transparent transition-shadow hover:ring-white/40",
                )}
                style={{ background: gradient }}
                aria-hidden={!iconInteractive}
              >
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-[19px] leading-7 font-bold tracking-tight text-ink">{title}</h2>
              {subtitle && <p className="mt-1 text-[13px] leading-5 text-ink-3">{subtitle}</p>}
            </div>
            {headerActions && <div className="shrink-0 flex items-center gap-2">{headerActions}</div>}
            <button
              onClick={requestClose}
              aria-label="Close"
              className="-mr-2 -mt-1 shrink-0 rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
      </div>
      <SlidePanel panel={side} layer="z-10" name="aside" />
      <SlidePanel panel={detailPanel} layer="z-20" name="detail" />
      <Modal
        open={confirmingDiscard}
        onClose={() => setConfirmingDiscard(false)}
        title={t("confirm.discardTitle")}
        width="sm:max-w-md"
        gradient="linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)"
      >
        <p className="px-6 py-5 text-[14px] leading-6.5 text-ink-2">{t("confirm.discardBody")}</p>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={() => setConfirmingDiscard(false)} autoFocus>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setConfirmingDiscard(false);
              onClose();
            }}
          >
            {t("confirm.discard")}
          </Button>
        </ModalFooter>
      </Modal>
      {stack.mounted && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div
            className={cx(
              "flex h-[86%] w-full flex-col justify-center",
              width,
              "transition-[translate,opacity] duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
              // Rises from below into focus, a little above centre so the page behind peeks out under it.
              stack.shown ? "-translate-y-[5vh] opacity-100" : "translate-y-[70vh] opacity-0",
            )}
          >
            <div data-modal-layer="stacked" className="pointer-events-auto flex max-h-full min-h-0 flex-col">
              {stack.content}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>,
    document.body,
  );
}

/*
  A panel that animates both ways, so it outlives its content by one
  transition: mounted first, shown a frame later (so the browser has a closed
  state to transition from), and on the way out hidden first and unmounted
  once the transition has played. The last content is kept so the panel
  slides away still showing what it showed.
*/
type SlideState = { mounted: boolean; shown: boolean; content: ReactNode };

function useSlidePanel(node: ReactNode): SlideState {
  const present = Boolean(node);
  const last = useRef<ReactNode>(null);
  if (node) last.current = node;
  const [mounted, setMounted] = useState(present);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (present) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), ASIDE_MS + 50);
    return () => window.clearTimeout(timer);
  }, [present]);
  return { mounted, shown, content: node ?? last.current };
}

/** A dialog's side panel: beside it on a wide screen, over it on a narrow one. */
function SlidePanel({
  panel,
  layer,
  name,
  position = "right",
}: {
  panel: SlideState;
  layer: string;
  name: string;
  position?: "left" | "right";
}) {
  if (!panel.mounted) return null;
  const isLeft = position === "left";
  return (
    <div
      aria-hidden={!panel.shown}
      data-modal-layer={name}
      className={cx(
        "absolute inset-0 flex items-center justify-center",
        layer,
        "xl:relative xl:inset-auto xl:z-auto xl:h-full xl:max-h-full xl:overflow-hidden",
        "transition-[opacity,max-width] duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        // Exactly the panel's width plus its gap, so no part of the
        // transition is spent growing past what can be seen.
        panel.shown ? "opacity-100 xl:max-w-[35rem]" : "pointer-events-none opacity-0 xl:max-w-0",
      )}
    >
      <div
        className={cx(
          // A definite height, so the panel's own max-h-full resolves and it
          // scrolls inside rather than running off the screen.
          "flex h-full w-full max-w-xl min-w-0 flex-col justify-center xl:w-[34rem] xl:shrink-0",
          isLeft ? "xl:mr-4" : "xl:ml-4",
          "transition-transform duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          // Comes out from behind on a wide screen, in from the edge on a narrow one.
          panel.shown
            ? "translate-x-0"
            : isLeft
              ? "-translate-x-[110%]"
              : "translate-x-[110%] xl:-translate-x-10",
        )}
      >
        {panel.content}
      </div>
    </div>
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
