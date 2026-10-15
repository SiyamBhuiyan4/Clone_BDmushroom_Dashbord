import { useMemo, useState } from "react";
import { BarChart3, CalendarClock, CheckCircle2, Download, Eye, Receipt, ShoppingBag, Wallet } from "lucide-react";
import type { Doc } from "../../convex/_generated/dataModel";
import { Badge, Button, cx } from "./ui";
import { RangePills } from "./RangePills";
import { SidePanelCard } from "./SidePanelCard";
import { MiniTile, RANGES } from "./VendorPurchaseHistory";
import { useRangeFilter } from "../lib/dateRange";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { plural, relativeTime } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { downloadReceipt, previewReceipt } from "../lib/pdf";
import type { ReceiptOrder } from "../lib/receipt";

/** The receipt shape, from a stored sale. */
export function toReceipt(order: Doc<"orders">): ReceiptOrder {
  return {
    orderNo: order.orderNo,
    orderedAt: order.orderedAt,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    items: order.items.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    deliveryCharge: order.deliveryCharge,
    total: order.total,
    paymentStatus: order.paymentStatus,
    paidAmount: order.paidAmount,
    orderStatus: order.orderStatus,
    note: order.note,
  };
}

const STATUS_TONE: Record<string, "neutral" | "good" | "warning" | "critical" | "accent"> = {
  pending: "warning",
  confirmed: "accent",
  delivered: "good",
  cancelled: "critical",
};
const PAYMENT_TONE: Record<string, "neutral" | "good" | "warning" | "critical"> = {
  paid: "good",
  partial: "warning",
  due: "critical",
};

/*
  Same rule as the Sales page's Total due: only a sale that has gone out
  counts — a cancelled one is owed by nobody, a pending one not yet.
*/
const isBooked = (o: Doc<"orders">) => o.orderStatus === "confirmed" || o.orderStatus === "delivered";
const paidOf = (o: Doc<"orders">) => o.paidAmount ?? (o.paymentStatus === "paid" ? o.total : 0);
const dueOf = (o: Doc<"orders">) => (isBooked(o) ? Math.max(0, o.total - paidOf(o)) : 0);

/** Opens a receipt PDF in a new tab, or saves it — with the error shown if it fails. */
function useReceiptActions() {
  const { lang } = useSettings();
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(order: Doc<"orders">, save: boolean) {
    setBusy(order._id);
    try {
      if (save) {
        await downloadReceipt(toReceipt(order), { bengali: lang === "bn" });
        toast.ok(t("orders.receiptDownloaded"));
      } else {
        await previewReceipt(toReceipt(order), { bengali: lang === "bn" });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return { busy, preview: (o: Doc<"orders">) => void run(o, false), download: (o: Doc<"orders">) => void run(o, true) };
}

/**
 * What one customer has bought: how much in the picked range, what they
 * still owe, and every receipt — a row opens it in the next panel, the eye
 * opens its PDF straight away.
 */
export function CustomerDashboardPanel({
  name,
  orders,
  onClose,
  onOpenReceipt,
  openId,
}: {
  name: string;
  orders: Doc<"orders">[];
  onClose: () => void;
  onOpenReceipt: (order: Doc<"orders">) => void;
  /** The receipt currently open beside this, if any — its row is marked. */
  openId?: string;
}) {
  const { fmt, fmtNum, fmtSaleTime } = useSettings();
  const t = useT();
  const range = useRangeFilter("ac.range.customer", RANGES, 3650);
  const { busy, preview } = useReceiptActions();

  const inRange = useMemo(
    () => orders.filter((o) => o.orderedAt >= range.since && o.orderedAt < range.untilExclusive),
    [orders, range.since, range.untilExclusive],
  );
  const booked = inRange.filter(isBooked);
  const bought = booked.reduce((sum, o) => sum + o.total, 0);
  const units = booked.reduce((sum, o) => sum + o.items.reduce((n, i) => n + i.quantity, 0), 0);
  // Owed is owed whenever it was bought, so this ignores the range.
  const due = orders.reduce((sum, o) => sum + dueOf(o), 0);
  const owing = orders.filter((o) => dueOf(o) > 0).length;
  // Not owed yet, but worth seeing: what pending orders will add once they go out.
  const pendingOwed = orders
    .filter((o) => o.orderStatus === "pending")
    .reduce((sum, o) => sum + Math.max(0, o.total - paidOf(o)), 0);
  const pendingNote = pendingOwed > 0 ? `+${fmt(pendingOwed)} on pending` : null;
  const lastAt = orders.length > 0 ? Math.max(...orders.map((o) => o.orderedAt)) : null;

  return (
    <SidePanelCard icon={<BarChart3 size={18} />} title={t("vendors.dashboard")} subtitle={name} onClose={onClose}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1">
          <RangePills range={range} />
        </div>

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
            <p className="text-[12.5px] font-semibold text-white/80">{t("customers.bought")}</p>
            <span className="flex size-8 items-center justify-center rounded-xl bg-white/20" aria-hidden>
              <ShoppingBag size={16} />
            </span>
          </div>
          <p className="relative mt-2 truncate text-[32px] leading-10 font-bold tracking-tight">{fmt(bought)}</p>
          <p className="relative mt-1 text-[12.5px] text-white/75">
            {plural(booked.length, "order")} · {plural(units, "unit")} · {range.activeLabel.full}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {due > 0 ? (
            <MiniTile
              gradient="var(--grad-crimson)"
              icon={<Wallet size={15} />}
              label={t("orders.remainingDue")}
              value={fmt(due)}
              sub={pendingNote ? `${plural(owing, "order")} unpaid · ${pendingNote}` : `${plural(owing, "order")} unpaid`}
              tone="critical"
            />
          ) : (
            <MiniTile
              gradient="var(--grad-emerald)"
              icon={<CheckCircle2 size={15} />}
              label={t("orders.remainingDue")}
              value={fmt(0)}
              sub={pendingNote ?? "All settled"}
              tone="good"
            />
          )}
          <MiniTile
            gradient="var(--grad-sky)"
            icon={<CalendarClock size={15} />}
            label={t("customers.lastOrder")}
            value={lastAt ? relativeTime(lastAt) : "—"}
            sub={booked.length > 0 ? `avg ${fmt(bought / booked.length)} / order` : "No orders yet"}
          />
        </div>

        {inRange.length === 0 ? (
          <p className="py-2 text-[13px] text-ink-3">{t("customers.noOrdersInRange")}</p>
        ) : (
          <>
            <p className="mt-1 text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase">
              {t("customers.receipts")} · {inRange.length}
            </p>
            <ul className="flex flex-col gap-2">
              {inRange.map((o) => {
                const owed = dueOf(o);
                return (
                  <li
                    key={o._id}
                    className={cx(
                      "flex items-stretch rounded-xl border bg-page transition-colors",
                      openId === o._id ? "border-accent" : "border-line",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenReceipt(o)}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-l-xl px-3.5 py-3 text-left hover:bg-surface-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                          {o.orderNo}
                          <Badge tone={PAYMENT_TONE[o.paymentStatus] ?? "neutral"}>
                            {t(`orders.${o.paymentStatus}` as never)}
                          </Badge>
                          {o.orderStatus !== "confirmed" && (
                            <Badge tone={STATUS_TONE[o.orderStatus] ?? "neutral"}>
                              {t(`orders.${o.orderStatus}` as never)}
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-ink-3">
                          {fmtSaleTime(o.orderedAt)} ·{" "}
                          {o.items.map((i) => `${i.productName} ×${fmtNum(i.quantity)}`).join(", ")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-bold tabular-nums text-ink">{fmt(o.total)}</p>
                        {owed > 0 && (
                          <p className="text-[11px] font-semibold tabular-nums text-critical-ink">
                            {t("orders.remainingDue")} {fmt(owed)}
                          </p>
                        )}
                      </div>
                    </button>
                    {/* Straight to the PDF, without opening the receipt panel. */}
                    <button
                      type="button"
                      onClick={() => preview(o)}
                      disabled={busy === o._id}
                      aria-label={`${t("orders.preview")} ${o.orderNo}`}
                      title={t("orders.preview")}
                      className="flex shrink-0 items-center rounded-r-xl border-l border-line px-3 text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent disabled:opacity-50"
                    >
                      <Eye size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </SidePanelCard>
  );
}

/** One receipt, read in full beside the dashboard, with its PDF a click away. */
export function ReceiptPanel({ order, onClose }: { order: Doc<"orders">; onClose: () => void }) {
  const { fmt, fmtNum, fmtSaleTime } = useSettings();
  const t = useT();
  const { busy, preview, download } = useReceiptActions();
  const paid = paidOf(order);
  const owed = Math.max(0, order.total - paid);

  return (
    <SidePanelCard
      icon={<Receipt size={18} />}
      title={order.orderNo}
      subtitle={fmtSaleTime(order.orderedAt)}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => preview(order)} disabled={busy === order._id}>
            <Eye size={15} />
            {t("orders.preview")}
          </Button>
          <Button variant="secondary" onClick={() => download(order)} disabled={busy === order._id} aria-label={t("orders.receipt")} title={t("orders.receipt")}>
            <Download size={15} />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={PAYMENT_TONE[order.paymentStatus] ?? "neutral"}>{t(`orders.${order.paymentStatus}` as never)}</Badge>
          <Badge tone={STATUS_TONE[order.orderStatus] ?? "neutral"}>{t(`orders.${order.orderStatus}` as never)}</Badge>
        </div>

        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-page">
          {order.items.map((i, n) => (
            <li key={n} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">{i.productName}</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-ink-3">
                  {fmtNum(i.quantity)} {i.unit} × {fmt(i.unitPrice)}
                </p>
              </div>
              <p className="shrink-0 text-[13.5px] font-semibold tabular-nums text-ink">{fmt(i.quantity * i.unitPrice)}</p>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-2 rounded-2xl border border-line bg-page px-4 py-3.5 text-[13px]">
          <Row label={t("orders.subtotal")} value={fmt(order.subtotal)} />
          {order.discount > 0 && <Row label={t("orders.discount")} value={`−${fmt(order.discount)}`} />}
          {order.deliveryCharge > 0 && <Row label={t("orders.delivery")} value={fmt(order.deliveryCharge)} />}
          <div className="my-1 border-t border-line" />
          <Row label={t("orders.total")} value={fmt(order.total)} strong />
          <Row label={t("orders.paidSoFar")} value={fmt(paid)} />
          <Row label={t("orders.remainingDue")} value={fmt(owed)} tone={owed > 0 ? "critical" : "good"} strong />
        </dl>

        {order.note && <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-ink-2">{order.note}</p>}
      </div>
    </SidePanelCard>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "good" | "critical";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={cx(
          "tabular-nums",
          strong ? "font-bold" : "font-medium",
          tone === "critical" ? "text-critical-ink" : tone === "good" ? "text-good-ink" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
