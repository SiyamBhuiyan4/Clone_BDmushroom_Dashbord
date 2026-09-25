import { useEffect, useRef, useState } from "react";
import { AlertTriangle, KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Input, Modal, ModalFooter } from "./ui";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";

/**
 * A confirmation that costs something to get through.
 *
 * `ConfirmDialog` asks a question anyone holding the laptop can answer by
 * clicking. This one asks for the passcode, which is the difference between
 * confirming an intention and confirming that a browser is unlocked. The
 * passcode is checked on the server by the mutation itself, so a client that
 * skipped this dialog entirely would still be refused.
 *
 * The field is cleared on a failure and the dialog stays open: a mistyped
 * passcode is the common case, and closing the dialog would make the retry
 * start from the beginning. Focus is put back in the field for the same
 * reason — the browser parks it on the close button after the submit, so
 * without this the retry types into nothing and the next Enter dismisses the
 * dialog instead of sending it.
 */
export function PasscodeConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  tone = "critical",
  icon,
}: {
  open: boolean;
  onClose: () => void;
  /** Receives the typed passcode; throw to keep the dialog open. */
  onConfirm: (passcode: string) => Promise<void>;
  title: string;
  body: string;
  confirmLabel?: string;
  /*
    Not every action behind the passcode is destructive. Confirming a sale
    asks for the same proof as deleting one, but dressing it in the critical
    red would teach the shopkeeper that red means nothing in particular.
  */
  tone?: "critical" | "neutral";
  icon?: ReactNode;
}) {
  const t = useT();
  const toast = useToast();
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setPasscode("");
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode || busy) return;
    setBusy(true);
    try {
      await onConfirm(passcode);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setPasscode("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={icon ?? <AlertTriangle size={19} />}
      // A destructive dialog wears the destructive colour, not the brand one.
      gradient={
        tone === "critical" ? "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" : undefined
      }
      width="sm:max-w-md"
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 px-6 py-6">
          {/* Callers pass the record being acted on above the explanation, so the
              break between them has to survive. */}
          <p className="text-[14px] leading-6.5 whitespace-pre-line text-ink-2">{body}</p>

          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-2">{t("confirm.passcode")}</span>
            <div className="relative">
              <KeyRound
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <Input
                ref={inputRef}
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="pl-10"
                // Autofocus is safe here: the dialog only ever opens from a
                // deliberate click on a delete control.
                autoFocus
              />
            </div>
            <span className="text-[12px] leading-4.5 text-ink-3">{t("confirm.passcodeHint")}</span>
          </label>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant={tone === "critical" ? "danger" : "primary"}
            disabled={!passcode || busy}
          >
            {busy ? t("common.saving") : (confirmLabel ?? t("common.delete"))}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
