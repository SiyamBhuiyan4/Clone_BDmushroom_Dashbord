import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button, Input, cx } from "./ui";
import { useSession } from "../lib/session";
import { errorMessage } from "../lib/toast";

/**
 * Nothing renders until the server confirms a live session. This is a gate,
 * not decoration — the Convex functions behind it independently reject any
 * call without a valid token, so bypassing this screen gains nothing.
 */
export function PasscodeGate({ children }: { children: ReactNode }) {
  const { status, configured, signIn } = useSession();

  if (status === "loading" || configured === undefined) return <Booting />;
  if (status === "signedIn") return <>{children}</>;
  // A deployment with no passcode cannot be claimed from the browser — it has
  // to be set with admin credentials. See NotConfigured.
  if (!configured) return <NotConfigured />;
  return <PasscodeScreen onSignedIn={signIn} />;
}

function Booting() {
  return (
    <div className="flex min-h-full items-center justify-center bg-page">
      <Loader2 size={22} className="animate-spin text-ink-3" aria-label="Loading" />
    </div>
  );
}

/**
 * Shown when a deployment has no passcode yet. Deliberately offers no way to
 * set one: the endpoint that does is internal, so whoever reaches a fresh
 * deployment first cannot take it over.
 */
function NotConfigured() {
  return (
    <div className="flex min-h-full items-center justify-center bg-page p-4">
      <div className="ac-pop-in w-full max-w-md text-center">
        <span
          className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-hero)]"
          style={{ background: "var(--grad-violet)" }}
        >
          <ShieldCheck size={24} />
        </span>
        <h1 className="text-[22px] leading-7 font-bold tracking-tight text-ink">
          No passcode set
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-6 text-ink-3">
          This deployment has no passcode yet, and one cannot be set from here.
          Run this with your Convex credentials:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface px-4 py-3 text-left text-[12.5px] text-ink">
          npx convex run auth:setPasscode {"'"}
          {'{"passcode":"…"}'}
          {"'"}
        </pre>
        <p className="mt-3 text-[12px] leading-5 text-ink-3">
          Add <code className="text-ink-2">--prod</code> to target production.
        </p>
      </div>
    </div>
  );
}

function PasscodeScreen({
  onSignedIn,
}: {
  onSignedIn: (token: string, expiresAt: number) => void;
}) {
  const login = useMutation(api.auth.login);

  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = passcode.length > 0 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      /*
        A wrong passcode comes back as `ok: false`, not as a thrown error. It
        has to: the server records the failed attempt in the same transaction,
        and a throw would roll that record back — which is why the throttle
        counted nothing for as long as this waited on a `catch`.
      */
      const result = await login({ passcode });
      if (!result.ok) {
        setError(result.error);
        setPasscode("");
        return;
      }
      onSignedIn(result.token, result.expiresAt);
    } catch (err) {
      // Still reachable: no passcode configured, or the network dropped.
      setError(errorMessage(err));
      setPasscode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-page p-4">
      <div className="ac-pop-in w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span
            className="mb-4 flex size-14 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-hero)]"
            style={{ background: "var(--grad-violet)" }}
          >
            <Wallet size={24} />
          </span>
          <h1 className="text-[22px] leading-7 font-bold tracking-tight text-ink">Ledger</h1>
          <p className="mt-1.5 max-w-xs text-[13.5px] leading-6 text-ink-3">
            Enter your passcode to continue.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink-2">Passcode</span>
              <div className="relative">
                <KeyRound
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
                  aria-hidden
                />
                <Input
                  type="password"
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  autoFocus
                  className="pl-10"
                />
              </div>
            </label>

            {error && (
              <p
                role="alert"
                className={cx(
                  "rounded-xl border border-[color-mix(in_srgb,var(--critical)_28%,transparent)]",
                  "bg-critical-soft px-3.5 py-2.5 text-[12.5px] font-medium text-critical-ink",
                )}
              >
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" disabled={!canSubmit} className="w-full">
              {busy ? "Checking…" : "Unlock"}
            </Button>
          </div>
        </form>

        <p className="mt-5 flex items-start justify-center gap-2 px-2 text-center text-[12px] leading-5 text-ink-3">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>Sessions last one day, then you sign in again.</span>
        </p>
      </div>
    </div>
  );
}
