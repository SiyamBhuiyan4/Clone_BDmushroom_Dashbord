import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";
import { CloudOff, Clock, Loader2 } from "lucide-react";
import { Button, cx } from "./ui";
import { useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";

/** Warn this long before the session lapses. */
const WARN_BEFORE_MS = 5 * 60 * 1000;

/**
 * Connection state.
 *
 * Convex is realtime, so a dropped socket does not blank the page — it keeps
 * showing the last data it received, with no sign that it is now stale. On a
 * phone that is a genuine hazard: you could record a sale into a dead
 * connection and believe it saved.
 */
export function ConnectionBanner() {
  const state = useConvexConnectionState();
  const t = useT();
  // Don't flash on a normal momentary reconnect.
  const [settled, setSettled] = useState(false);

  const offline = !state.isWebSocketConnected;

  useEffect(() => {
    if (!offline) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), 2500);
    return () => clearTimeout(timer);
  }, [offline]);

  if (!offline || !settled) return null;

  return (
    <div
      role="status"
      className="ac-slide-down sticky top-0 z-30 flex items-center justify-center gap-2 bg-critical-solid px-4 py-2 text-[12.5px] font-semibold text-white"
    >
      <CloudOff size={14} aria-hidden />
      {t("status.offline")}
      <Loader2 size={13} className="animate-spin" aria-hidden />
    </div>
  );
}

/**
 * Session expiry warning.
 *
 * The session used to end on a timer with no notice, so it could lapse
 * mid-form and throw away whatever had been typed. This offers to extend it
 * before that happens.
 */
export function SessionWarning() {
  const { expiresAt, renew, signOut } = useSession();
  const { fmtNum } = useSettings();
  const t = useT();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const remaining = expiresAt ? expiresAt - now : Infinity;
  const showing = remaining <= WARN_BEFORE_MS && remaining > 0;

  useEffect(() => {
    if (!expiresAt) return;
    // Only tick while close enough to matter.
    const untilWarning = expiresAt - WARN_BEFORE_MS - Date.now();
    if (untilWarning > 0) {
      const timer = setTimeout(() => setNow(Date.now()), untilWarning + 100);
      return () => clearTimeout(timer);
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt, now]);

  if (!showing) return null;

  const minutes = Math.max(1, Math.ceil(remaining / 60000));

  return (
    <div
      role="alertdialog"
      aria-label={t("status.sessionEnding")}
      className={cx(
        "ac-slide-down fixed inset-x-4 top-4 z-60 mx-auto flex max-w-md flex-wrap items-center gap-3",
        "rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-pop)] sm:inset-x-auto sm:right-6 sm:left-auto",
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: "var(--grad-amber)" }}
        aria-hidden
      >
        <Clock size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-ink">{t("status.sessionEnding")}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          {t("status.sessionIn")} {fmtNum(minutes)} {t("status.minutes")}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={signOut}>
          {t("nav.signOut")}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await renew();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("status.staySignedIn")}
        </Button>
      </div>
    </div>
  );
}
