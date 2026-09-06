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
  return <PasscodeScreen firstRun={!configured} onSignedIn={signIn} />;
}

function Booting() {
  return (
    <div className="flex min-h-full items-center justify-center bg-page">
      <Loader2 size={22} className="animate-spin text-ink-3" aria-label="Loading" />
    </div>
  );
}

function PasscodeScreen({
  firstRun,
  onSignedIn,
}: {
  firstRun: boolean;
  onSignedIn: (token: string, expiresAt: number) => void;
}) {
  const login = useMutation(api.auth.login);
  const setup = useMutation(api.auth.setup);

  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = firstRun && passcode.length > 0 && passcode.length < 6;
  const mismatch = firstRun && confirm.length > 0 && passcode !== confirm;
  const canSubmit =
    passcode.length > 0 && !busy && (!firstRun || (passcode.length >= 6 && passcode === confirm));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = firstRun ? await setup({ passcode }) : await login({ passcode });
      onSignedIn(result.token, result.expiresAt);
    } catch (err) {
      setError(errorMessage(err));
      setPasscode("");
      setConfirm("");
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
          <h1 className="text-[22px] leading-7 font-bold tracking-tight text-ink">
            {firstRun ? "Set a passcode" : "Ledger"}
          </h1>
          <p className="mt-1.5 max-w-xs text-[13.5px] leading-6 text-ink-3">
            {firstRun
              ? "Choose a passcode for this dashboard. It is hashed before it is stored — nobody can read it back, so keep it somewhere safe."
              : "Enter your passcode to continue."}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink-2">
                {firstRun ? "New passcode" : "Passcode"}
              </span>
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
                  placeholder={firstRun ? "At least 6 characters" : "••••••••"}
                  autoComplete={firstRun ? "new-password" : "current-password"}
                  autoFocus
                  className="pl-10"
                />
              </div>
              {tooShort && (
                <p className="text-[12px] text-critical-ink">Use at least 6 characters.</p>
              )}
            </label>

            {firstRun && (
              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-ink-2">Confirm passcode</span>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Type it again"
                  autoComplete="new-password"
                />
                {mismatch && (
                  <p className="text-[12px] text-critical-ink">Passcodes do not match.</p>
                )}
              </label>
            )}

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
              {busy ? "Checking…" : firstRun ? "Set passcode & continue" : "Unlock"}
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
