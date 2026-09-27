import { useState, type ReactNode } from "react";
import { useAction, useMutation } from "convex/react";
import { KeyRound, Loader2, Mail, ShieldCheck, Wallet } from "lucide-react";
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
  return <SignInScreen onSignedIn={signIn} />;
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
          Then add the addresses allowed to sign in:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface px-4 py-3 text-left text-[12.5px] text-ink">
          npx convex run otp:allowEmail {"'"}
          {'{"email":"you@gmail.com"}'}
          {"'"}
        </pre>
      </div>
    </div>
  );
}

/** Which proof the screen is currently asking for. */
type Step = "email" | "code" | "passcode";

/**
 * Signing in, in two proofs.
 *
 * The emailed code comes first, and the passcode field stays shut until it is
 * answered. A wrong passcode does not simply clear the field: the server
 * revokes the grant behind it, so the screen returns to the start and the next
 * attempt costs another email. That ordering is the point — it limits passcode
 * guessing to the speed of an inbox rather than the speed of typing.
 *
 * The browser decides none of this. It holds a grant token the server issued
 * and can withdraw; an enabled field here is a consequence of that token
 * existing, never the cause of being let in.
 */
function SignInScreen({
  onSignedIn,
}: {
  onSignedIn: (token: string, expiresAt: number) => void;
}) {
  const requestCode = useAction(api.otp.requestCode);
  const verifyCode = useMutation(api.otp.verifyCode);
  const completeLogin = useMutation(api.otp.completeLogin);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [passcode, setPasscode] = useState("");
  const [grantToken, setGrantToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestCode({ email });
      if (!result.ok) {
        setError(result.error ?? "The code could not be sent.");
        return;
      }
      setCode("");
      setStep("code");
      setNotice(`Code sent to ${email.trim().toLowerCase()}. It expires in 10 minutes.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyCode({ email, code });
      if (!result.ok) {
        setError(result.error);
        setCode("");
        return;
      }
      setGrantToken(result.grantToken);
      setPasscode("");
      setStep("passcode");
      setNotice("Code accepted. Now enter your passcode.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitPasscode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !grantToken || passcode.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await completeLogin({ grantToken, passcode });
      if (!result.ok) {
        /*
          The grant is spent whether or not the passcode was right, so there is
          nothing left to retry against. Back to the start, with the address
          kept so the only thing to redo is the code itself.
        */
        setGrantToken(null);
        setPasscode("");
        setCode("");
        setStep("email");
        setError(`${result.error} Verify by email again to unlock the passcode.`);
        return;
      }
      onSignedIn(result.token, result.expiresAt);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setGrantToken(null);
    setStep("email");
    setCode("");
    setPasscode("");
    setError(null);
    setNotice(null);
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
            {step === "email"
              ? "Sign in with your email, then your passcode."
              : step === "code"
                ? "Enter the code we emailed you."
                : "Code accepted. Now your passcode."}
          </p>
        </div>

        <StepDots step={step} />

        <div className="rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          {step === "email" && (
            <form onSubmit={sendCode} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-ink-2">Email</span>
                <div className="relative">
                  <Mail
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
                    aria-hidden
                  />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="you@gmail.com"
                    autoComplete="email"
                    autoFocus
                    className="pl-10"
                  />
                </div>
              </label>
              <Message error={error} notice={notice} />
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !email.trim()}
                className="w-full"
              >
                {busy ? "Sending…" : "Email me a code"}
              </Button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={submitCode} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-ink-2">Six-digit code</span>
                <Input
                  value={code}
                  onChange={(e) => {
                    // Digits only, so a pasted "123 456" still works.
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setError(null);
                  }}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  className="text-center text-[22px] font-bold tracking-[0.4em] tabular-nums"
                />
              </label>
              <Message error={error} notice={notice} />
              <Button
                type="submit"
                variant="primary"
                disabled={busy || code.length < 6}
                className="w-full"
              >
                {busy ? "Checking…" : "Verify code"}
              </Button>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={startOver}
                  className="text-[12.5px] font-semibold text-ink-3 hover:text-ink"
                >
                  Use another email
                </button>
                <button
                  type="button"
                  onClick={() => sendCode()}
                  disabled={busy}
                  className="text-[12.5px] font-semibold text-accent hover:underline disabled:opacity-40"
                >
                  Send again
                </button>
              </div>
            </form>
          )}

          {step === "passcode" && (
            <form onSubmit={submitPasscode} className="flex flex-col gap-4">
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
              <Message error={error} notice={notice} />
              <p className="text-[12px] leading-4.5 text-ink-3">
                One try. A wrong passcode closes this step and needs a fresh emailed code.
              </p>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || passcode.length === 0}
                className="w-full"
              >
                {busy ? "Checking…" : "Unlock"}
              </Button>
              <button
                type="button"
                onClick={startOver}
                className="text-[12.5px] font-semibold text-ink-3 hover:text-ink"
              >
                Start again
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 flex items-start justify-center gap-2 px-2 text-center text-[12px] leading-5 text-ink-3">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>Sessions last one day, then you sign in again.</span>
        </p>
      </div>
    </div>
  );
}

/** Where you are in the two proofs, so the screen never feels like a loop. */
function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["email", "code", "passcode"];
  const at = order.indexOf(step);
  return (
    <ol className="mb-3 flex items-center justify-center gap-2" aria-label="Sign-in progress">
      {order.map((s, i) => (
        <li
          key={s}
          aria-current={i === at ? "step" : undefined}
          className={cx(
            "h-1.5 rounded-full transition-all duration-300",
            i === at ? "w-7 bg-accent" : i < at ? "w-4 bg-accent/45" : "w-4 bg-line-strong",
          )}
        />
      ))}
    </ol>
  );
}

function Message({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) {
    return (
      <p
        role="alert"
        className={cx(
          "rounded-xl border border-[color-mix(in_srgb,var(--critical)_28%,transparent)]",
          "bg-critical-soft px-3.5 py-2.5 text-[12.5px] font-medium text-critical-ink",
        )}
      >
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p className="rounded-xl border border-line bg-page px-3.5 py-2.5 text-[12.5px] text-ink-2">
        {notice}
      </p>
    );
  }
  return null;
}
