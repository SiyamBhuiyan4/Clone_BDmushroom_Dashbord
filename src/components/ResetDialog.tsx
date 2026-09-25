import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, KeyRound, RotateCcw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button, Input, Modal, ModalFooter, SectionLabel, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { useT, type MessageKey } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

/** The kinds of dated record a reset can take. */
type Kind = "sales" | "orders" | "costs" | "lots";
const KINDS: Kind[] = ["sales", "orders", "costs", "lots"];

/*
  Open-ended when a date is left blank, which is how every other date control
  in the app reads an empty field. A reset with neither end set is a reset of
  everything dated, and saying so is better than making the shopkeeper guess
  a start date far enough back.
*/
const OPEN_END = Number.MAX_SAFE_INTEGER;

/**
 * Resetting a period.
 *
 * Two gates, for two different mistakes. The passcode proves it is the owner
 * and not a browser someone walked past — it is re-checked on the server, so
 * a client that skipped this dialog is refused anyway. The typed word is
 * slower and catches the other mistake: doing this by reflex, on the wrong
 * range, because the button was where Cancel usually is.
 *
 * Every figure below comes from the server against the real range, so what
 * the dialog promises to remove is what the mutation will remove.
 */
export function ResetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { fmt, fmtNum } = useSettings();
  const t = useT();
  const toast = useToast();
  const reset = useAuthedMutation(api.danger.resetRange);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ticked, setTicked] = useState<Record<Kind, boolean>>({
    sales: true,
    orders: false,
    costs: false,
    lots: false,
  });
  const [restoreStock, setRestoreStock] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  // A fresh dialog every time. A range left over from the last reset is the
  // kind of thing that gets confirmed without being read.
  useEffect(() => {
    if (!open) return;
    setFrom("");
    setTo("");
    setTicked({ sales: true, orders: false, costs: false, lots: false });
    setRestoreStock(true);
    setPasscode("");
    setTyped("");
  }, [open]);

  const bounds = useMemo(
    () => ({
      from: from ? new Date(`${from}T00:00:00`).getTime() : 0,
      to: to ? new Date(`${to}T23:59:59.999`).getTime() : OPEN_END,
    }),
    [from, to],
  );

  const backwards = bounds.to < bounds.from;
  const preview = useAuthedQuery(
    api.danger.previewReset,
    open && !backwards ? { from: bounds.from, to: bounds.to } : "skip",
  );

  const counts: Record<Kind, number> = {
    sales: preview?.sales.count ?? 0,
    orders: preview?.orders.count ?? 0,
    costs: preview?.costs.count ?? 0,
    lots: preview?.lots.count ?? 0,
  };
  // Only what is both ticked and actually there counts toward "is there
  // anything to do" — ticking an empty kind should not arm the button.
  const selectedTotal = KINDS.reduce((n, k) => n + (ticked[k] ? counts[k] : 0), 0);
  const anyTicked = KINDS.some((k) => ticked[k]);

  const CONFIRM_WORD = t("reset.confirmWord");
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;
  const canSubmit =
    anyTicked && selectedTotal > 0 && confirmed && passcode.length > 0 && !backwards && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await reset({
        passcode,
        from: bounds.from,
        to: bounds.to,
        sales: ticked.sales,
        orders: ticked.orders,
        costs: ticked.costs,
        lots: ticked.lots,
        restoreStock,
      });
      toast.ok(t("reset.done").replace("{n}", fmtNum(res.total)));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setPasscode("");
    } finally {
      setBusy(false);
    }
  }

  /** The line under each tickbox: how many, and what they are worth. */
  function summaryFor(kind: Kind) {
    if (!preview) return "—";
    const n = fmtNum(counts[kind]);
    if (kind === "sales") {
      return `${n} · ${fmt(preview.sales.revenue)} · ${fmtNum(preview.sales.units)} ${t("reset.units")}`;
    }
    if (kind === "orders") return `${n} · ${fmt(preview.orders.total)}`;
    if (kind === "costs") return `${n} · ${fmt(preview.costs.amount)}`;
    return `${n} · ${fmtNum(preview.lots.units)} ${t("reset.units")} · ${fmt(preview.lots.cost)}`;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<RotateCcw size={19} />}
      gradient="linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)"
      title={t("reset.title")}
      subtitle={t("reset.subtitle")}
      width="sm:max-w-lg"
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-2.5">
            <SectionLabel>{t("reset.dateRange")}</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-ink-2">{t("reset.from")}</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-ink-2">{t("reset.to")}</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {backwards ? (
              <p className="text-[12px] font-semibold text-critical-ink">
                The end date is before the start date.
              </p>
            ) : (
              <p className="text-[12px] leading-4.5 text-ink-3">{t("reset.allTime")}</p>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>{t("reset.whatGoes")}</SectionLabel>
            <ul className="flex flex-col gap-2">
              {KINDS.map((kind) => {
                const empty = preview !== undefined && counts[kind] === 0;
                return (
                  <li key={kind}>
                    <label
                      className={cx(
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                        ticked[kind]
                          ? "border-critical bg-critical-soft"
                          : "border-line bg-page hover:bg-surface-2",
                        empty && "opacity-55",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={ticked[kind]}
                        onChange={(e) =>
                          setTicked((prev) => ({ ...prev, [kind]: e.target.checked }))
                        }
                        className="mt-0.5 size-4 shrink-0 accent-[var(--critical)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[13.5px] font-semibold text-ink">
                            {t(`reset.${kind}` as MessageKey)}
                          </span>
                          <span className="text-[12.5px] font-semibold tabular-nums text-ink-2">
                            {summaryFor(kind)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-4.5 text-ink-3">
                          {t(`reset.${kind}Hint` as MessageKey)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {/*
            Stock is a running number, so this is a real choice rather than a
            detail. Re-entering a period needs the units back or they come off
            twice; writing off a closed period does not, and returning them
            would inflate today's inventory.
          */}
          <label
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
              restoreStock ? "border-accent bg-accent-soft" : "border-line bg-page",
            )}
          >
            <input
              type="checkbox"
              checked={restoreStock}
              onChange={(e) => setRestoreStock(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="text-[13.5px] font-semibold text-ink">
                {t("reset.restoreStock")}
              </span>
              <span className="mt-0.5 block text-[12px] leading-4.5 text-ink-3">
                {t("reset.restoreStockHint")}
              </span>
            </span>
          </label>

          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--critical)_28%,transparent)] bg-critical-soft p-4">
            <p className="flex items-start gap-2 text-[13px] leading-5.5 font-semibold text-critical-ink">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
              {anyTicked && selectedTotal === 0 && preview !== undefined
                ? t("reset.nothing")
                : `${fmtNum(selectedTotal)} ${t("reset.records")} will be permanently removed, and the numbers on every page will change to match.`}
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-2">
              {t("reset.typeToConfirm").split("{word}")[0]}
              <span className="font-bold text-ink">{CONFIRM_WORD}</span>
              {t("reset.typeToConfirm").split("{word}")[1]}
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
            <span className="text-[13px] font-semibold text-ink-2">{t("confirm.passcode")}</span>
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
            <span className="text-[12px] leading-4.5 text-ink-3">{t("confirm.passcodeHint")}</span>
          </label>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="danger" disabled={!canSubmit}>
            <RotateCcw size={16} />
            {busy ? t("reset.running") : t("reset.run")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
