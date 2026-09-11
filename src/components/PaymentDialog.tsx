import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AmountInput, Button, Modal, ModalFooter, SectionLabel, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { CURRENCY_SYMBOL } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation } from "../lib/session";

type Status = "due" | "partial" | "paid";

/**
 * Records what a customer has paid against an order.
 *
 * The amount box only appears for a partial payment, because for the other
 * two the amount is implied — full or nothing — and offering an editable
 * figure there just invites the two to disagree.
 */
export function PaymentDialog({
  open,
  onClose,
  order,
}: {
  open: boolean;
  onClose: () => void;
  order: Doc<"orders"> | null;
}) {
  const { fmt } = useSettings();
  const t = useT();
  const toast = useToast();
  const setPayment = useAuthedMutation(api.orders.setPayment);

  const [status, setStatus] = useState<Status>("due");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setStatus(order.paymentStatus as Status);
    setAmount(order.paidAmount ? String(order.paidAmount) : "");
  }, [open, order]);

  if (!order) return null;

  const paid = status === "paid" ? order.total : status === "due" ? 0 : Number(amount) || 0;
  const due = order.total - paid;
  const partialValid = status !== "partial" || (paid > 0 && paid < order.total);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !partialValid || saving) return;
    setSaving(true);
    try {
      await setPayment({
        id: order._id,
        paymentStatus: status,
        paidAmount: status === "partial" ? paid : undefined,
      });
      toast.ok(t("orders.paymentSaved"));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const options: { value: Status; label: string }[] = [
    { value: "due", label: t("orders.due") },
    { value: "partial", label: t("orders.partial") },
    { value: "paid", label: t("orders.paid") },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Wallet size={19} />}
      title={t("orders.recordPayment")}
      subtitle={`${order.orderNo} · ${order.customerName}`}
      width="sm:max-w-md"
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-2.5">
            <SectionLabel>{t("orders.payment")}</SectionLabel>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-page p-1">
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  aria-pressed={status === o.value}
                  style={status === o.value ? { background: "var(--grad-violet)" } : undefined}
                  className={cx(
                    "h-9 rounded-lg text-[13px] font-bold transition-all",
                    status === o.value ? "text-white" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {status === "partial" && (
            <div className="ac-fade-in flex flex-col gap-2.5">
              <SectionLabel>{t("orders.amountPaid")}</SectionLabel>
              <AmountInput
                symbol={CURRENCY_SYMBOL}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
              {!partialValid && amount !== "" && (
                <p className="text-[12px] font-semibold text-critical-ink">
                  {t("orders.partialRange")} {fmt(order.total)}.
                </p>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-line bg-page p-5">
            <Row label={t("orders.total")} value={fmt(order.total)} />
            <Row label={t("orders.paidSoFar")} value={fmt(paid)} />
            <div className="mt-3 flex items-end justify-between gap-4 border-t border-line pt-3">
              <span className="text-[13px] font-bold text-ink">{t("orders.remainingDue")}</span>
              <span
                className={cx(
                  "text-[24px] leading-8 font-bold tabular-nums",
                  due > 0 ? "text-critical-ink" : "text-good-ink",
                )}
              >
                {fmt(Math.max(0, due))}
              </span>
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!partialValid || saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className="text-[14px] font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
