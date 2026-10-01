import { useState } from "react";
import {
  Eye,
  FileText,
  Globe,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  UserRound,
  Wallet,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge, Modal, cx } from "./ui";
import { ContactPhotoAvatar } from "./ContactPhotoAvatar";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor } from "../lib/avatar";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { downloadReceipt, previewReceipt } from "../lib/pdf";
import type { ReceiptOrder } from "../lib/receipt";
import { uploadFile } from "../lib/upload";
import { externalUrl, whatsappUrl } from "../../convex/shared";

/** The receipt shape, from a stored sale. */
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

/**
 * One customer and everything they have bought, with each sale's receipt a
 * click away.
 *
 * The whole row opens the receipt rather than a small icon: on this screen a
 * sale exists to be looked at, and hunting for a 15px target to do the one
 * obvious thing is a worse answer than making the row itself the button.
 */
export function CustomerDetailDialog({
  open,
  onClose,
  customerId,
}: {
  open: boolean;
  onClose: () => void;
  customerId: Id<"customers"> | null;
}) {
  const { fmt, fmtNum, fmtDateFull, lang } = useSettings();
  const t = useT();
  const toast = useToast();
  const data = useAuthedQuery(api.customers.detail, customerId ? { id: customerId } : "skip");
  const generateUploadUrl = useAuthedMutation(api.customers.generateUploadUrl);
  const setPhoto = useAuthedMutation(api.customers.setPhoto);
  const [busy, setBusy] = useState<string | null>(null);

  const bengali = lang === "bn";
  const name = data?.customer.name ?? "";

  async function open_(order: Doc<"orders">, save: boolean) {
    setBusy(order._id);
    try {
      if (save) {
        await downloadReceipt(toReceipt(order), { bengali });
        toast.ok(t("orders.receiptDownloaded"));
      } else {
        await previewReceipt(toReceipt(order), { bengali });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={
        data?.customer ? (
          <ContactPhotoAvatar
            photoUrl={data.customer.photoUrl}
            onUpload={async (file) => {
              const uploadUrl = await generateUploadUrl({});
              const storageId = await uploadFile(uploadUrl, file);
              await setPhoto({ id: data.customer._id, storageId });
            }}
          />
        ) : (
          <UserRound size={19} />
        )
      }
      iconInteractive={Boolean(data?.customer)}
      gradient={name ? gradientFor(name) : undefined}
      title={name || t("customers.title")}
      subtitle={data?.customer.phone ?? data?.customer.address ?? undefined}
      width="sm:max-w-2xl"
    >
      {!data ? (
        <div className="ac-skeleton h-64 bg-surface" aria-hidden />
      ) : (
        <div className="flex flex-col gap-6 px-6 py-6">
          {(data.customer.phone || data.customer.address || data.customer.facebookUrl) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-2">
              {data.customer.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={14} className="text-ink-3" aria-hidden />
                  {data.customer.phone}
                </span>
              )}
              {data.customer.extraPhones?.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <Phone size={14} className="text-ink-3" aria-hidden />
                  {p}
                </span>
              ))}
              {/* The two that are worth a click get one. */}
              {whatsappUrl(data.customer.whatsapp ?? data.customer.phone) && (
                <a
                  href={whatsappUrl(data.customer.whatsapp ?? data.customer.phone)!}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 font-semibold text-good-ink hover:underline"
                >
                  <MessageCircle size={14} aria-hidden />
                  {data.customer.whatsapp && data.customer.whatsapp !== data.customer.phone
                    ? data.customer.whatsapp
                    : t("customers.whatsapp")}
                </a>
              )}
              {externalUrl(data.customer.facebookUrl) && (
                <a
                  href={externalUrl(data.customer.facebookUrl)!}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"
                >
                  <Globe size={14} aria-hidden />
                  {t("customers.facebook")}
                </a>
              )}
              {data.customer.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-ink-3" aria-hidden />
                  {data.customer.address}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("customers.spent")} value={fmt(data.totals.spent)} icon={<Wallet size={14} />} />
            <Stat
              label={t("customers.orders")}
              value={fmtNum(data.totals.count)}
              icon={<Receipt size={14} />}
            />
            <Stat
              label={t("common.units")}
              value={fmtNum(data.totals.items)}
              icon={<Package size={14} />}
            />
            <Stat
              label={t("customers.balance")}
              value={
                data.totals.balance < 0
                  ? `−${fmt(Math.abs(data.totals.balance))}`
                  : fmt(data.totals.balance)
              }
              hint={
                data.totals.balance < 0
                  ? t("customers.theyOweYou")
                  : data.totals.balance > 0
                    ? t("customers.youOweThem")
                    : t("customers.settled")
              }
              icon={<Wallet size={14} />}
              tone={
                data.totals.balance < 0 ? "critical" : data.totals.balance > 0 ? "warning" : undefined
              }
            />
          </div>

          <div>
            <p className="mb-2.5 text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
              {t("customers.theirSales")}
            </p>
            {data.sales.length === 0 ? (
              <p className="text-[13px] text-ink-3">{t("customers.noOrdersYet")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.sales.map((order) => (
                  <li key={order._id}>
                    <div className="rounded-xl border border-line bg-page">
                      <button
                        type="button"
                        onClick={() => void open_(order, false)}
                        disabled={busy === order._id}
                        className={cx(
                          "flex w-full items-start gap-3 rounded-t-xl px-3.5 py-3 text-left transition-colors",
                          "hover:bg-surface-2 disabled:opacity-60",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
                            {order.orderNo}
                            <Badge tone={PAYMENT_TONE[order.paymentStatus] ?? "neutral"}>
                              {t(`orders.${order.paymentStatus}` as never)}
                            </Badge>
                            <Badge tone={STATUS_TONE[order.orderStatus] ?? "neutral"}>
                              {t(`orders.${order.orderStatus}` as never)}
                            </Badge>
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-ink-3">
                            {fmtDateFull(order.orderedAt)} ·{" "}
                            {order.items
                              .map((i) => `${i.productName} ×${fmtNum(i.quantity)}`)
                              .join(", ")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[14px] font-bold tabular-nums text-ink">
                            {fmt(order.total)}
                          </p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                            <Eye size={12} aria-hidden />
                            {t("orders.preview")}
                          </p>
                        </div>
                      </button>
                      <div className="flex justify-end border-t border-line px-3.5 py-2">
                        <button
                          type="button"
                          onClick={() => void open_(order, true)}
                          disabled={busy === order._id}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
                        >
                          <FileText size={13} aria-hidden />
                          {t("orders.receipt")}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "critical" | "warning";
  /** A short line under the value — used to say which way a signed figure runs. */
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-page px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      <p
        className={cx(
          "mt-1 truncate text-[17px] font-bold tabular-nums",
          tone === "critical" ? "text-critical-ink" : tone === "warning" ? "text-warning-ink" : "text-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}
