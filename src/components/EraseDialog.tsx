import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button, Input, Modal, ModalFooter, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

export type EraseScope =
  | { kind: "range"; from: number; to: number; label: string }
  | { kind: "all" };

/**
 * Erasing needs the passcode again, not just a live session — a confirmation
 * step that a passer-by can click through is not a confirmation step.
 *
 * The typed word is a second, deliberately slow gate: it makes the action
 * impossible to complete by reflex.
 */
export function EraseDialog({
  open,
  onClose,
  scope,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  scope: EraseScope | null;
  onDone?: () => void;
}) {
  const { fmt, fmtNum, fmtDateFull } = useSettings();
  const toast = useToast();
  const eraseRange = useAuthedMutation(api.danger.eraseRange);
  const eraseAll = useAuthedMutation(api.danger.eraseAll);

  const rangeScope = scope?.kind === "range" ? scope : null;
  const previewRange = useAuthedQuery(
    api.danger.previewRange,
    rangeScope ? { from: rangeScope.from, to: rangeScope.to } : "skip",
  );
  const previewAll = useAuthedQuery(
    api.danger.previewAll,
    scope?.kind === "all" ? {} : "skip",
  );

  const [passcode, setPasscode] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPasscode("");
      setTyped("");
    }
  }, [open]);

  const CONFIRM_WORD = scope?.kind === "all" ? "ERASE ALL" : "ERASE";
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;
  const nothingToDo =
    scope?.kind === "range"
      ? previewRange !== undefined && previewRange.count === 0
      : previewAll !== undefined &&
        previewAll.sales + previewAll.products + previewAll.lots === 0;
  const canSubmit = Boolean(scope) && passcode.length > 0 && confirmed && !busy && !nothingToDo;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !scope) return;
    setBusy(true);
    try {
      if (scope.kind === "range") {
        const res = await eraseRange({ passcode, from: scope.from, to: scope.to });
        toast.ok(`Erased ${fmtNum(res.removed)} sales.`);
      } else {
        const res = await eraseAll({ passcode });
        toast.ok(`Erased ${fmtNum(res.removed)} records.`);
      }
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setPasscode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<AlertTriangle size={19} />}
      gradient="linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)"
      title={scope?.kind === "all" ? "Erase all data" : "Erase this range"}
      subtitle="This cannot be undone from the app."
      width="sm:max-w-lg"
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 px-6 py-6">
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--critical)_28%,transparent)] bg-critical-soft p-5">
            <p className="text-[13.5px] leading-6 font-semibold text-critical-ink">
              {scope?.kind === "all"
                ? "Every product, sale and stock lot will be permanently removed."
                : `Every sale in ${rangeScope?.label ?? "this range"} will be permanently removed.`}
            </p>
            <p className="mt-2 text-[13px] leading-6 text-ink-2">
              You will not be able to recover it from the app, and the numbers on every page will
              change to match.
            </p>

            {scope?.kind === "range" && previewRange && (
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[color-mix(in_srgb,var(--critical)_20%,transparent)] pt-4">
                <Stat label="Sales" value={fmtNum(previewRange.count)} />
                <Stat label="Revenue" value={fmt(previewRange.revenue)} />
                <Stat label="Profit" value={fmt(previewRange.profit)} />
              </dl>
            )}
            {scope?.kind === "all" && previewAll && (
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[color-mix(in_srgb,var(--critical)_20%,transparent)] pt-4">
                <Stat label="Products" value={fmtNum(previewAll.products)} />
                <Stat label="Sales" value={fmtNum(previewAll.sales)} />
                <Stat label="Stock lots" value={fmtNum(previewAll.lots)} />
              </dl>
            )}
            {rangeScope && (
              <p className="mt-3 text-[12px] leading-5 text-ink-3">
                {fmtDateFull(rangeScope.from)} – {fmtDateFull(rangeScope.to)}. The search box is
                not applied — this erases the whole date range.
              </p>
            )}
          </div>

          {nothingToDo ? (
            <p className="text-[13px] text-ink-3">There is nothing to erase.</p>
          ) : (
            <>
              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-ink-2">
                  Type <span className="font-bold text-ink">{CONFIRM_WORD}</span> to confirm
                </span>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  autoComplete="off"
                  spellCheck={false}
                  className={cx(confirmed && "border-critical")}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-ink-2">Your passcode</span>
                <div className="relative">
                  <KeyRound
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
                    aria-hidden
                  />
                  <Input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-10"
                  />
                </div>
              </label>
            </>
          )}
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!canSubmit}>
            <Trash2 size={16} />
            {busy ? "Erasing…" : scope?.kind === "all" ? "Erase everything" : "Erase range"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold tracking-wide text-ink-3 uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-bold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
