import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Plus,
  Receipt,
  Wallet,
  Search,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Select, cx } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { OrderDialog } from "../components/OrderDialog";
import { PaymentDialog } from "../components/PaymentDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PasscodeConfirmDialog } from "../components/PasscodeConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
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

export function OrdersPage() {
  const { fmt, fmtNum, fmtDateFull, lang } = useSettings();
  const t = useT();
  const toast = useToast();
  const orders = useAuthedQuery(api.orders.list, {});
  const confirmOrder = useAuthedMutation(api.orders.confirm);
  const cancelOrder = useAuthedMutation(api.orders.cancel);
  const removeOrder = useAuthedMutation(api.orders.remove);
  const savedCustomers = useAuthedQuery(api.customers.list) ?? [];
  const dropCustomer = useAuthedMutation(api.customers.remove);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Doc<"orders"> | null>(null);
  const [droppingCustomer, setDroppingCustomer] = useState<{
    id: Id<"customers">;
    name: string;
  } | null>(null);
  const [paying, setPaying] = useState<Doc<"orders"> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (status && o.orderStatus !== status) return false;
      if (!term) return true;
      return (
        o.orderNo.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term) ||
        (o.customerPhone ?? "").includes(term) ||
        o.items.some((i) => i.productName.toLowerCase().includes(term))
      );
    });
  }, [orders, search, status]);

  const pager = usePagination(rows, `${search}|${status}`, 25);
  const bengali = lang === "bn";

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {t("orders.title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3 sm:text-[14px]">{t("orders.subtitle")}</p>
        </div>
        <div className="flex w-full items-center gap-2.5 sm:w-auto">
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
            <Download size={17} />
            {t("orders.allReceipts")}
          </Button>
          <Button variant="primary" onClick={() => setAddOpen(true)} className="flex-1 sm:flex-none">
            <Plus size={17} />
            {t("orders.newOrder")}
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

      {orders === undefined ? (
        <div className="ac-skeleton h-72 rounded-card border border-line bg-surface" aria-hidden />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt size={24} />}
            title={search || status ? t("orders.noMatches") : t("orders.none")}
            body={t("orders.noneBody")}
            action={
              !search && !status ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <Plus size={17} />
                  {t("orders.newOrder")}
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
                  {(order.orderStatus === "confirmed" || order.orderStatus === "delivered") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === order._id}
                      onClick={() =>
                        run(order._id, () => cancelOrder({ id: order._id }), t("orders.cancelledToast"))
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
                itemLabel="orders"
              />
            </Card>
          )}
        </>
      )}

      {/*
        The address book, kept at the foot of the page rather than inside the
        order dialog: it is read while typing an order and tidied at leisure,
        and those are different moments.
      */}
      <Card>
        <CardHeader
          title={t("orders.savedCustomers")}
          subtitle={t("orders.savedCustomersSub")}
        />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {savedCustomers.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-ink-3">
              <UserRound size={15} aria-hidden />
              {t("orders.noSavedCustomers")}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {savedCustomers.map((c) => (
                <li
                  key={c._id}
                  className="flex items-center gap-3 rounded-xl border border-line-strong bg-page py-2 pr-2 pl-3"
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white"
                    style={{ background: gradientFor(c.name) }}
                    aria-hidden
                  >
                    {initialOf(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{c.name}</p>
                    <p className="truncate text-[11.5px] text-ink-3">
                      {[c.phone, c.address].filter(Boolean).join(" · ") || t("orders.noDetails")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-ink-3">
                    {fmtNum(c.orderCount)}
                  </span>
                  <button
                    onClick={() =>
                      setDroppingCustomer({ id: c._id as Id<"customers">, name: c.name })
                    }
                    aria-label={`${t("common.delete")} ${c.name}`}
                    className="shrink-0 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-critical"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <OrderDialog open={addOpen} onClose={() => setAddOpen(false)} />
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
      <PasscodeConfirmDialog
        open={droppingCustomer !== null}
        onClose={() => setDroppingCustomer(null)}
        title={t("orders.dropCustomerTitle")}
        confirmLabel={t("orders.dropCustomer")}
        body={droppingCustomer ? t("orders.dropCustomerBody") : ""}
        onConfirm={async (passcode) => {
          if (!droppingCustomer) return;
          await dropCustomer({ id: droppingCustomer.id, passcode });
          toast.ok(t("orders.customerDropped"));
        }}
      />
    </div>
  );
}
