import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AmountInput, Badge, Button, Modal, ModalFooter, cx } from "./ui";
import { RangePills } from "./RangePills";
import { DEFAULT_RANGES, useRangeFilter, type RangePreset } from "../lib/dateRange";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { CURRENCY_SYMBOL } from "../lib/format";
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
const dueOf = (l: Doc<"stockBatches">) => (l.vendorPaid !== undefined ? totalOf(l) - l.vendorPaid : 0);

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

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">{t("vendors.lotsBought")}</p>
      {/* Scrolls sideways rather than pushing a narrow panel wider than the screen. */}
      <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1">
        <RangePills range={range} />
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-page p-3">
        <Figure label={t("vendors.spent")} value={fmt(summary.spent)} />
        <Figure
          label={t("vendors.unitsBought")}
          value={fmtNum(summary.units)}
          sub={`${fmtNum(inRange.length)} ${t("vendors.lots")}`}
        />
        <Figure label={t("vendors.stillOwe")} value={fmt(owed)} critical={owed > 0} />
      </div>

      {summary.groups.length > 1 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-ink-3">{t("vendors.byProduct")}</p>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-page">
            {summary.groups.map((g) => (
              <li key={`${g.product}|${g.size}`} className="flex items-center justify-between gap-3 px-3.5 py-2">
                <span className="min-w-0 truncate text-[12.5px] text-ink-2">
                  {g.product} <span className="text-ink-3">· {g.size}</span>
                </span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-ink">
                  {fmtNum(g.units)} · <span className="font-semibold">{fmt(g.spent)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {inRange.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-3">{t("vendors.noPurchases")}</p>
      ) : (
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
      )}

      <PayVendorDialog lot={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function Figure({ label, value, sub, critical }: { label: string; value: string; sub?: string; critical?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9.5px] font-bold tracking-wider text-ink-3 uppercase">{label}</p>
      <p
        className={cx(
          "mt-0.5 truncate text-[14px] font-bold tabular-nums",
          critical ? "text-critical-ink" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="truncate text-[10.5px] text-ink-3">{sub}</p>}
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
