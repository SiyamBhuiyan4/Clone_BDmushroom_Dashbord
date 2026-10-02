import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

type Action = { label: string; run: () => void | Promise<void> };
type Toast = { id: number; kind: "ok" | "error"; text: string; action?: Action };

type ToastApi = {
  ok: (text: string) => void;
  error: (text: string) => void;
  /**
   * A confirmation that can be taken back. Deleting a sale is the most
   * frequent destructive action and the least protected — a confirm dialog
   * catches the deliberate mistake, an undo catches the misclick.
   */
  undoable: (text: string, action: Action) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: Toast["kind"], text: string, action?: Action) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, kind, text, action }]);
      // Errors linger, an undo needs time to be noticed, confirmations get
      // out of the way.
      const ttl = kind === "error" ? 6000 : action ? 7000 : 3000;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      ok: (text: string) => push("ok", text),
      error: (text: string) => push("error", text),
      undoable: (text: string, action: Action) => push("ok", text, action),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-100 flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="ac-slide-in-right pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-[var(--shadow-pop)]"
          >
            {t.kind === "ok" ? (
              <CheckCircle2 size={18} className="mt-px shrink-0 text-good" aria-hidden />
            ) : (
              <AlertTriangle size={18} className="mt-px shrink-0 text-critical" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-5.5 font-medium text-ink">{t.text}</p>
              {t.action && (
                <button
                  onClick={() => {
                    void t.action!.run();
                    dismiss(t.id);
                  }}
                  className="mt-1 rounded-md text-[12.5px] font-bold text-accent underline underline-offset-2 hover:brightness-110"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-0.5 rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/**
 * Pulls the readable message out of a ConvexError, falling back to a generic
 * one.
 *
 * Everything that is not a ConvexError used to collapse to the same generic
 * string — so a flaky connection, a cancelled request and a genuine bug all
 * read identically, and a shopkeeper reporting "something went wrong" told
 * us nothing. The common browser-level failures are named here instead;
 * anything else still shows its own short message rather than being hidden.
 */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (typeof data === "string" && data) return data;
  }
  if (err instanceof Error && err.name === "AbortError") {
    return "That took too long and was cancelled — check your connection and try again.";
  }
  if (err instanceof Error && err.message) {
    // Convex wraps server messages; keep the useful tail if present.
    const match = err.message.match(/Uncaught ConvexError:\s*(.+)/);
    if (match) return match[1].split("\n")[0];

    const message = err.message.toLowerCase();
    if (
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("load failed") ||
      message.includes("internet connection appears to be offline")
    ) {
      return "Network problem — check your internet connection and try again.";
    }
    if (message.includes("dynamically imported module") || message.includes("importing a module script failed")) {
      return "Couldn't load that — try again, or reload the page.";
    }

    const trimmed = err.message.trim();
    if (trimmed && trimmed.length < 120) return trimmed;
  }
  return "Something went wrong. Please try again.";
}
