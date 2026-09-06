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

type Toast = { id: number; kind: "ok" | "error"; text: string };

type ToastApi = {
  ok: (text: string) => void;
  error: (text: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: Toast["kind"], text: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, kind, text }]);
      // Errors linger; confirmations get out of the way.
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      ok: (text: string) => push("ok", text),
      error: (text: string) => push("error", text),
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
            <p className="min-w-0 flex-1 text-[13.5px] leading-5.5 font-medium text-ink">{t.text}</p>
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

/** Pulls the readable message out of a ConvexError, falling back to a generic one. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (typeof data === "string" && data) return data;
  }
  if (err instanceof Error && err.message) {
    // Convex wraps server messages; keep the useful tail if present.
    const match = err.message.match(/Uncaught ConvexError:\s*(.+)/);
    if (match) return match[1].split("\n")[0];
  }
  return "Something went wrong. Please try again.";
}
