import type { ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

/**
 * The chrome of a dialog's side panel (see `Modal`'s `aside` and `detail`):
 * a header with an icon, a title and a way out — back on a narrow screen,
 * where the panel covers what opened it, close on a wide one — over a body
 * that scrolls inside the panel.
 */
export function SidePanelCard({
  icon,
  title,
  subtitle,
  actions,
  onClose,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  /** Extra header controls, beside the close button. */
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div data-modal-panel className="flex max-h-full w-full min-w-0 flex-col rounded-[24px] border border-line bg-surface shadow-[var(--shadow-pop)]">
      <div className="relative shrink-0 overflow-hidden rounded-t-[24px] border-b border-line">
        <div
          className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full opacity-[0.13] blur-3xl"
          style={{ background: "var(--grad-violet)" }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3 px-5 py-4">
          <button
            onClick={onClose}
            aria-label="Back"
            className="-ml-1 rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink xl:hidden"
          >
            <ArrowLeft size={18} />
          </button>
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-hero)]"
            style={{ background: "var(--grad-violet)" }}
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[17px] leading-6 font-bold tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="truncate text-[12.5px] text-ink-3">{subtitle}</p>}
          </div>
          {actions}
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 hidden rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink xl:block"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </div>
  );
}
