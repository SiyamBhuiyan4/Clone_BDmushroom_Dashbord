import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Plus,
  Receipt,
  Wallet,
  RotateCcw,
  Search,
  TrendingUp,
  CircleDollarSign,
  Trash2,
  XCircle,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Select, cx } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { StatTile } from "../components/StatTile";
import { SaleDialog } from "../components/SaleDialog";
import { PaymentDialog } from "../components/PaymentDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { CURRENCY_CODE, plural, startOfLocalDay } from "../lib/format";
import { downloadReceipt, downloadReceipts, previewReceipt } from "../lib/pdf";
import type { ReceiptOrder } from "../lib/receipt";

/** The order shape the receipt module wants, from a stored order. */
function toReceipt(order: Doc<"orders">): ReceiptOrder {
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

const DAY = 24 * 60 * 60 * 1000;

/*
  What a sale was actually worth.

  Delivery is excluded because it is a pass-through rather than product
  revenue — folding it in inflates the margin. The discount comes off the
  revenue, which is how confirming a sale books it: spread across the lines in
  proportion to their value. So this agrees with the Profit page by
  construction rather than by coincidence.
*/
function moneyOf(order: Doc<"orders">) {
  const cost = order.items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0);
  const revenue = order.subtotal - order.discount;
  return { revenue, cost, profit: revenue - cost };
}

/** Only a sale that has actually happened counts toward the totals. */
const isBooked = (o: Doc<"orders">) =>
  o.orderStatus === "confirmed" || o.orderStatus === "delivered";

export function SalesPage() {
  const { fmt, fmtNum, fmtPercent, fmtDateFull, lang } = useSettings();
  const t = useT();
  const toast = useToast();
  const orders = useAuthedQuery(api.orders.list, {});
  const confirmOrder = useAuthedMutation(api.orders.confirm);
  const cancelOrder = useAuthedMutation(api.orders.cancel);
  const removeOrder = useAuthedMutation(api.orders.remove);
  const restoreOrder = useAuthedMutation(api.orders.restore);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [rangeDays, setRangeDays] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Doc<"orders"> | null>(null);
  const [paying, setPaying] = useState<Doc<"orders"> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const from = useMemo(
    () => (rangeDays > 0 ? startOfLocalDay(Date.now() - (rangeDays - 1) * DAY) : 0),
    [rangeDays],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (o.orderedAt < from) return false;
      if (status && o.orderStatus !== status) return false;
      if (!term) return true;
      return (
        o.orderNo.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term) ||
        (o.customerPhone ?? "").includes(term) ||
        o.items.some((i) => i.productName.toLowerCase().includes(term))
      );
    });
  }, [orders, search, status, from]);

  /*
    Totals cover every sale the filters leave on screen, not the page being
    shown — a figure that changes when you turn the page is not a total.
  */
  const totals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let booked = 0;
    let pending = 0;
    for (const o of rows) {
      if (!isBooked(o)) {
        if (o.orderStatus === "pending") pending++;
        continue;
      }
      const m = moneyOf(o);
      revenue += m.revenue;
      cost += m.cost;
      booked++;
    }
    return { revenue, cost, profit: revenue - cost, booked, pending };
  }, [rows]);

  const pager = usePagination(rows, `${search}|${status}|${rangeDays}`, 25);
  const bengali = lang === "bn";

  const RANGES = [
    { days: 0, label: t("dash.allTime") },
    { days: 7, label: "7d" },
    { days: 30, label: "30d" },
    { days: 90, label: "90d" },
    { days: 365, label: "12m" },
  ];

  function exportCsv() {
    const header = [
      "Date",
      "No",
      "Customer",
      "Phone",
      "Status",
      "Payment",
      "Items",
      `Subtotal (${CURRENCY_CODE})`,
      `Discount (${CURRENCY_CODE})`,
      `Delivery (${CURRENCY_CODE})`,
      `Total (${CURRENCY_CODE})`,
      `Profit (${CURRENCY_CODE})`,
    ];
    const body = rows.map((o) => [
      new Date(o.orderedAt).toISOString(),
      o.orderNo,
      o.customerName,
      o.customerPhone ?? "",
      o.orderStatus,
      o.paymentStatus,
      o.items.map((i) => `${i.productName} x${i.quantity}`).join("; "),
      o.subtotal,
      o.discount,
      o.deliveryCharge,
      o.total,
      isBooked(o) ? moneyOf(o).profit : "",
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.ok(`Exported ${plural(rows.length, "sale")}.`);
  }

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.ok(ok);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  /*
    Cancelling is the one action here that is easy to do by accident and
    expensive to put right by hand: the ledger lines are gone and the stock
    has moved. So it offers the way back rather than an apology.
  */
  async function cancelWithUndo(order: Doc<"orders">) {
    setBusy(order._id);
    try {
      await cancelOrder({ id: order._id });
      toast.undoable(t("orders.cancelledToast"), {
        label: t("toast.undo"),
        run: async () => {
          try {
            await restoreOrder({ id: order._id });
            toast.ok(t("orders.restoredToast"));
          } catch (err) {
            toast.error(errorMessage(err));
          }
        },
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {t("sales.title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3 sm:text-[14px]">{t("sales.subtitle")}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <Button
            variant="secondary"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex-1 sm:flex-none"
          >
            <Download size={17} />
            {t("sales.export")}
          </Button>
          <Button
            variant="secondary"
            disabled={rows.length === 0 || busy === "bulk"}
            className="flex-1 sm:flex-none"
            onClick={() =>
              run(
                "bulk",
                () => downloadReceipts(rows.map(toReceipt), { bengali }),
                t("orders.receiptsDownloaded"),
              )
            }
          >
            <FileText size={17} />
            {t("orders.allReceipts")}
          </Button>
          <Button variant="primary" onClick={() => setAddOpen(true)} className="flex-1 sm:flex-none">
            <Plus size={17} />
            {t("sales.newSale")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 sm:min-w-60 sm:max-w-md sm:flex-1">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("orders.searchPlaceholder")}
            className="pl-10.5"
            aria-label={t("common.search")}
          />
        </div>
        <div className="w-full sm:w-36">
          <Select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            aria-label={t("common.date")}
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("orders.status")}>
            <option value="">{t("orders.allStatuses")}</option>
            <option value="pending">{t("orders.pending")}</option>
            <option value="confirmed">{t("orders.confirmed")}</option>
            <option value="delivered">{t("orders.delivered")}</option>
            <option value="cancelled">{t("orders.cancelled")}</option>
          </Select>
        </div>
      </div>

      <div className="ac-stagger grid gap-4 sm:grid-cols-3">
        <StatTile
          hero
          accent="violet"
          label={t("sales.profit")}
          value={totals.profit < 0 ? `−${fmt(Math.abs(totals.profit))}` : fmt(totals.profit)}
          icon={<TrendingUp size={17} />}
          sub={
            totals.revenue > 0
              ? `${fmtPercent(totals.profit / totals.revenue)} ${t("dash.margin")}`
              : undefined
          }
        />
        <StatTile
          accent="sky"
          label={t("sales.revenue")}
          value={fmt(totals.revenue)}
          icon={<CircleDollarSign size={17} />}
          sub={`${t("sales.cost")} ${fmt(totals.cost)}`}
        />
        <StatTile
          accent="amber"
          label={t("sales.title")}
          value={fmtNum(totals.booked)}
          icon={<Receipt size={17} />}
          sub={totals.pending > 0 ? `${fmtNum(totals.pending)} ${t("orders.pending")}` : undefined}
        />
      </div>

      {orders === undefined ? (
        <div className="ac-skeleton h-72 rounded-card border border-line bg-surface" aria-hidden />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt size={24} />}
            title={search || status || rangeDays ? t("orders.noMatches") : t("sales.none")}
            body={t("sales.noneBody")}
            action={
              !search && !status && !rangeDays ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <Plus size={17} />
                  {t("sales.newSale")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="ac-stagger flex flex-col gap-4">
            {pager.pageRows.map((order) => (
              <Card key={order._id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-[14px] font-bold text-white"
                      style={{ background: gradientFor(order.customerName) }}
                      aria-hidden
                    >
                      {initialOf(order.customerName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold tracking-tight text-ink">
                        {order.customerName}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-3">
                        {order.orderNo} · {fmtDateFull(order.orderedAt)}
                        {order.customerPhone ? ` · ${order.customerPhone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[18px] font-bold tabular-nums text-ink">{fmt(order.total)}</p>
                    {isBooked(order) && (
                      <p
                        className={cx(
                          "mt-0.5 text-[11.5px] font-bold tabular-nums",
                          moneyOf(order).profit < 0 ? "text-critical-ink" : "text-good-ink",
                        )}
                      >
                        {moneyOf(order).profit < 0
                          ? `−${fmt(Math.abs(moneyOf(order).profit))}`
                          : `+${fmt(moneyOf(order).profit)}`}{" "}
                        {t("sales.profit").toLowerCase()}
                      </p>
                    )}
                    {order.paymentStatus !== "paid" && (
                      <p className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-critical-ink">
                        {t("orders.remainingDue")}: {fmt(order.total - (order.paidAmount ?? 0))}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                      <Badge tone={PAYMENT_TONE[order.paymentStatus] ?? "neutral"}>
                        {t(`orders.${order.paymentStatus}` as never)}
                      </Badge>
                      <Badge tone={STATUS_TONE[order.orderStatus] ?? "neutral"}>
                        {t(`orders.${order.orderStatus}` as never)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
                  {order.items.map((i, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 truncate text-ink-2">{i.productName}</span>
                      <span className="shrink-0 tabular-nums text-ink-3">
                        {fmtNum(i.quantity)} {i.unit} × {fmt(i.unitPrice)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy === order._id}
                    onClick={() =>
                      run(order._id, () => downloadReceipt(toReceipt(order), { bengali }), t("orders.receiptDownloaded"))
                    }
                  >
                    <FileText size={15} />
                    {t("orders.receipt")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void previewReceipt(toReceipt(order), { bengali })}
                  >
                    <Eye size={15} />
                    {t("orders.preview")}
                  </Button>

                  <Button size="sm" variant="secondary" onClick={() => setPaying(order)}>
                    <Wallet size={15} />
                    {t("orders.payment")}
                  </Button>

                  {order.orderStatus === "pending" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === order._id}
                      onClick={() =>
                        run(order._id, () => confirmOrder({ id: order._id }), t("orders.confirmedToast"))
                      }
                    >
                      <CheckCircle2 size={15} />
                      {t("orders.confirm")}
                    </Button>
                  )}
                  {/*
                    A cancelled sale used to offer nothing at all, so the only
                    way back was the Undo in a toast that had already gone.
                    The way back belongs on the sale itself, where it is still
                    there tomorrow.
                  */}
                  {order.orderStatus === "cancelled" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === order._id}
                      onClick={() =>
                        run(
                          order._id,
                          () => restoreOrder({ id: order._id }),
                          t("orders.restoredToast"),
                        )
                      }
                    >
                      <RotateCcw size={15} />
                      {t("orders.restore")}
                    </Button>
                  )}
                  {(order.orderStatus === "confirmed" || order.orderStatus === "delivered") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === order._id}
                      onClick={() =>
                        void cancelWithUndo(order)
                      }
                    >
                      <XCircle size={15} />
                      {t("orders.cancel")}
                    </Button>
                  )}

                  <button
                    onClick={() => setDeleting(order)}
                    aria-label={t("common.delete")}
                    className={cx(
                      "ml-auto rounded-lg p-2 text-ink-3 transition-colors",
                      "hover:bg-surface-2 hover:text-critical",
                    )}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {pager.pageCount > 1 && (
            <Card>
              <Pagination
                page={pager.page}
                pageCount={pager.pageCount}
                pageSize={pager.pageSize}
                total={pager.total}
                onPage={pager.setPage}
                onPageSize={pager.setPageSize}
                itemLabel="sales"
              />
            </Card>
          )}
        </>
      )}

      <SaleDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <PaymentDialog open={paying !== null} onClose={() => setPaying(null)} order={paying} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("orders.deleteTitle")}
        body={t("orders.deleteBody")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await removeOrder({ id: deleting._id });
            toast.ok(t("orders.deleted"));
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}
