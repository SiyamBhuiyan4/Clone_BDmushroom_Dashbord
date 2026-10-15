import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Package, ShoppingBag, Wallet } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AmountInput, Badge, Button, Modal, ModalFooter, cx } from "./ui";
import { RangePills } from "./RangePills";
import { DEFAULT_RANGES, useRangeFilter, type RangePreset } from "../lib/dateRange";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { CURRENCY_SYMBOL, plural, relativeTime } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation } from "../lib/session";

/*
  A vendor's purchases are worth looking at over years, not just a year, so
  this offers "all" on top of the usual presets.
*/
const RANGES: RangePreset[] = [
  ...DEFAULT_RANGES,
  { days: 3650, label: "All", full: "all time", prev: "before that" },
];

const totalOf = (l: Doc<"stockBatches">) => l.quantity * l.unitCost;
/** What is still owed to the vendor for a lot — nothing unless a part payment was recorded. */
const dueOf = (l: Doc<"stockBatches">) => (l.vendorPaid !== undefined ? Math.max(0, totalOf(l) - l.vendorPaid) : 0);

/**
 * Everything bought from one vendor: what was spent in the picked range,
 * how much of it by product and size, what is still owed — and every lot,
 * including ones since taken off their product, since they were still bought.
 */
export function VendorPurchaseHistory({ lots }: { lots: Doc<"stockBatches">[] }) {
  const { fmt, fmtNum, fmtSaleTime } = useSettings();
  const t = useT();
  const range = useRangeFilter("ac.range.vendor", RANGES, 3650);
  const [paying, setPaying] = useState<Doc<"stockBatches"> | null>(null);

  const inRange = useMemo(
    () => lots.filter((l) => l.purchasedAt >= range.since && l.purchasedAt < range.untilExclusive),
    [lots, range.since, range.untilExclusive],
  );

  const summary = useMemo(() => {
    let spent = 0;
    let units = 0;
    const groups = new Map<string, { product: string; size: string; units: number; spent: number }>();
    for (const l of inRange) {
      spent += totalOf(l);
      units += l.quantity;
      const key = `${l.productId}|${l.label}`;
      const g = groups.get(key) ?? { product: l.productName, size: l.label, units: 0, spent: 0 };
      g.units += l.quantity;
      g.spent += totalOf(l);
      groups.set(key, g);
    }
    return { spent, units, groups: [...groups.values()].sort((a, b) => b.spent - a.spent) };
  }, [inRange]);

  // Owed is owed whenever it was bought, so this ignores the range.
  const owed = lots.reduce((sum, l) => sum + dueOf(l), 0);
  const lastAt = lots.length > 0 ? Math.max(...lots.map((l) => l.purchasedAt)) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">{t("vendors.lotsBought")}</p>
      {/* Scrolls sideways rather than pushing a narrow panel wider than the screen. */}
      <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1">
        <RangePills range={range} />
      </div>

      {/* The one number this panel is for, then what it is made of. */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-hero)]"
        style={{ background: "var(--grad-emerald)" }}
      >
        <div
          className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full opacity-25 blur-2xl"
          style={{ background: "rgba(255,255,255,0.9)" }}
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-3">
          <p className="text-[12.5px] font-semibold text-white/80">{t("vendors.spent")}</p>
          <span className="flex size-8 items-center justify-center rounded-xl bg-white/20" aria-hidden>
            <ShoppingBag size={16} />
          </span>
        </div>
        <p className="relative mt-2 truncate text-[32px] leading-10 font-bold tracking-tight">
          {fmt(summary.spent)}
        </p>
        <p className="relative mt-1 text-[12.5px] text-white/75">
          {plural(summary.units, "unit")} · {plural(inRange.length, "lot")} · {range.activeLabel.full}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {owed > 0 ? (
          <MiniTile
            gradient="var(--grad-crimson)"
            icon={<Wallet size={15} />}
            label={t("vendors.stillOwe")}
            value={fmt(owed)}
            sub={plural(lots.filter((l) => dueOf(l) > 0).length, "lot") + " unpaid"}
            tone="critical"
          />
        ) : (
          <MiniTile
            gradient="var(--grad-emerald)"
            icon={<CheckCircle2 size={15} />}
            label={t("vendors.stillOwe")}
            value={fmt(0)}
            sub="All settled"
            tone="good"
          />
        )}
        <MiniTile
          gradient="var(--grad-sky)"
          icon={<CalendarClock size={15} />}
          label={t("vendors.lastBought")}
          value={lastAt ? relativeTime(lastAt) : "—"}
          sub={summary.units > 0 ? `avg ${fmt(summary.spent / summary.units)} / unit` : "No purchases yet"}
        />
      </div>

      {summary.groups.length > 0 && (
        <div className="rounded-2xl border border-line bg-page p-4">
          <div className="mb-3 flex items-center gap-2">
            <Package size={14} className="text-ink-3" aria-hidden />
            <p className="text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase">{t("vendors.byProduct")}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {summary.groups.map((g) => {
              const share = summary.spent > 0 ? g.spent / summary.spent : 0;
              return (
                <li key={`${g.product}|${g.size}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] font-medium text-ink">
                      {g.product} <span className="font-normal text-ink-3">· {g.size}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{fmt(g.spent)}</span>
                  </div>
                  {/* Share of spend in the range, so the big purchases stand out. */}
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(3, share * 100)}%`, background: "var(--grad-emerald)" }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-ink-3">
                      {fmtNum(g.units)} units · {Math.round(share * 100)}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {inRange.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-3">{t("vendors.noPurchases")}</p>
      ) : (
        <>
        <p className="mt-1 text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase">
          {t("vendors.lotsHeading")} · {inRange.length}
        </p>
        <ul className="flex flex-col gap-2">
          {inRange.map((l) => {
            const due = dueOf(l);
            return (
              <li key={l._id} className="rounded-xl border border-line bg-page px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{l.productName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="accent">{l.label}</Badge>
                      {l.removedAt && <Badge tone="critical">{t("vendors.removedLot")}</Badge>}
                      <span className="text-[11.5px] text-ink-3">{fmtSaleTime(l.purchasedAt)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-bold tabular-nums text-ink">{fmt(totalOf(l))}</p>
                    {due > 0 ? (
                      <p className="text-[11.5px] font-semibold tabular-nums text-critical-ink">
                        {t("vendors.youOwe")} {fmt(due)}
                      </p>
                    ) : (
                      <p className="text-[11.5px] text-good-ink">{t("vendors.paid")}</p>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="text-[12px] tabular-nums text-ink-3">
                    {fmtNum(l.quantity)} × {fmt(l.unitCost)}
                    {l.unitPrice !== undefined && ` · sells ${fmt(l.unitPrice)}`}
                    {" · "}
                    {fmtNum(l.remaining ?? l.quantity)} left
                  </p>
                  {due > 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setPaying(l)}>
                      <Wallet size={14} />
                      {t("vendors.pay")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}

      <PayVendorDialog lot={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function MiniTile({
  gradient,
  icon,
  label,
  value,
  sub,
  tone,
}: {
  gradient: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "critical";
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-page p-4">
      <div
        className="pointer-events-none absolute -top-14 -right-10 size-32 rounded-full opacity-[0.14] blur-2xl"
        style={{ background: gradient }}
        aria-hidden
      />
      <div className="relative flex items-center justify-between gap-2">
        <p className="truncate text-[12px] font-semibold text-ink-2">{label}</p>
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: gradient }}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <p
        className={cx(
          "relative mt-2 truncate text-[20px] leading-7 font-bold tracking-tight tabular-nums",
          tone === "critical" ? "text-critical-ink" : tone === "good" ? "text-good-ink" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="relative mt-0.5 truncate text-[11.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

function PayVendorDialog({ lot, onClose }: { lot: Doc<"stockBatches"> | null; onClose: () => void }) {
  const { fmt } = useSettings();
  const t = useT();
  const toast = useToast();
  const pay = useAuthedMutation(api.profit.payVendor);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const due = lot ? dueOf(lot) : 0;
  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value > 0 && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lot || !valid) return;
    setSaving(true);
    try {
      const res = await pay({ id: lot._id, amount: value });
      toast.ok(res.due > 0 ? `${t("vendors.youOwe")} ${fmt(res.due)}` : t("vendors.paid"));
      setAmount("");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={lot !== null}
      onClose={onClose}
      icon={<Wallet size={19} />}
      title={t("vendors.payTitle")}
      subtitle={lot ? `${lot.productName} · ${lot.label} — ${t("vendors.youOwe")} ${fmt(due)}` : ""}
      width="sm:max-w-md"
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-2.5 px-6 py-6">
          <span className="text-[13px] font-semibold text-ink-2">{t("vendors.payAmount")}</span>
          <AmountInput
            symbol={CURRENCY_SYMBOL}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(due)}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setAmount(String(due))}
            className="self-start text-[12px] font-semibold text-accent hover:underline"
          >
            {t("vendors.paid")}: {fmt(due)}
          </button>
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {saving ? t("common.saving") : t("vendors.pay")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
