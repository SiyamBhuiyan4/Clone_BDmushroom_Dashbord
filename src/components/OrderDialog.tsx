import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookmarkPlus, Check, KeyRound, Receipt, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  AmountInput,
  Button,
  Field,
  Input,
  Modal,
  ModalFooter,
  SectionLabel,
  Select,
  Textarea,
  cx,
} from "./ui";
import { ProductPicker } from "./ProductPicker";
import { CustomerPicker, type SavedCustomer } from "./CustomerPicker";
import { customerKey } from "../../convex/shared";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { CURRENCY_SYMBOL } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

type Line = {
  key: string;
  productId: Id<"products">;
  productName: string;
  unit: string;
  stock: number;
  unitCost: number;
  quantity: string;
  unitPrice: string;
};

let lineSeq = 0;

export function OrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { fmt, fmtNum } = useSettings();
  const t = useT();
  const toast = useToast();
  const products = useAuthedQuery(api.products.list, {});
  const customers = useAuthedQuery(api.customers.list) ?? [];
  const create = useAuthedMutation(api.orders.create);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [delivery, setDelivery] = useState("");
  const [payment, setPayment] = useState("due");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState("");
  const [saveCustomer, setSaveCustomer] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setAddress("");
    setLines([]);
    setDiscount("");
    setDelivery("");
    setPayment("due");
    setNote("");
    setOverride("");
    setSaveCustomer(false);
  }, [open]);

  /*
    Whether these details are already in the address book — decided by the
    same function the server uses, not a second copy of the rule. A tick
    offered for someone already saved, or withheld from someone who is not,
    is visible to the shopkeeper immediately.
  */
  const known = useMemo(() => {
    if (!name.trim()) return false;
    const key = customerKey(name, phone);
    return customers.some((c) => customerKey(c.name, c.phone) === key);
  }, [customers, name, phone]);

  function fillFrom(c: SavedCustomer) {
    setName(c.name);
    setPhone(c.phone ?? "");
    setAddress(c.address ?? "");
  }

  function addProduct(p: Doc<"products">) {
    setLines((prev) => {
      // Picking the same product twice bumps its quantity rather than
      // creating a duplicate line the customer would have to reconcile.
      const existing = prev.find((l) => l.productId === p._id);
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key
            ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: `l${lineSeq++}`,
          productId: p._id,
          productName: p.name,
          unit: p.unit ?? "পিস",
          stock: p.quantity,
          quantity: "1",
          /*
            Only a real selling price is prefilled. Falling back to cost was
            silently guaranteeing zero profit on every line; an empty box that
            asks for a number is far better than a wrong one that looks filled.
          */
          unitPrice: p.sellPrice !== undefined ? String(p.sellPrice) : "",
          unitCost: p.costPrice,
        },
      ];
    });
  }

  const parsed = lines.map((l) => ({
    ...l,
    qty: Number(l.quantity),
    price: Number(l.unitPrice),
  }));
  const subtotal = parsed.reduce(
    (sum, l) => sum + (Number.isFinite(l.qty) && Number.isFinite(l.price) ? l.qty * l.price : 0),
    0,
  );
  const discountValue = Number(discount) || 0;
  const deliveryValue = Number(delivery) || 0;
  const total = subtotal - discountValue + deliveryValue;

  const shortLines = parsed.filter((l) => Number.isFinite(l.qty) && l.qty > l.stock);
  // Selling at or below cost is legitimate sometimes, but never by accident.
  const noMarginLines = parsed.filter(
    (l) => Number.isFinite(l.price) && l.unitPrice !== "" && l.price <= l.unitCost,
  );
  const linesValid =
    parsed.length > 0 &&
    parsed.every((l) => Number.isFinite(l.qty) && l.qty > 0 && Number.isFinite(l.price) && l.price >= 0);
  const valid =
    name.trim().length > 0 &&
    linesValid &&
    discountValue <= subtotal &&
    !saving &&
    (shortLines.length === 0 || override.length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await create({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        items: parsed.map((l) => ({
          productId: l.productId,
          quantity: l.qty,
          unitPrice: l.price,
        })),
        discount: discountValue,
        deliveryCharge: deliveryValue,
        paymentStatus: payment,
        note,
        overridePasscode: shortLines.length > 0 ? override : undefined,
        saveCustomer,
        source: "manual",
      });
      toast.ok(t("orders.created"));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setOverride("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Receipt size={19} />}
      title={t("orders.newOrder")}
      subtitle={t("orders.newOrderHint")}
      width="sm:max-w-3xl"
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4">
            <SectionLabel>{t("orders.customer")}</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("orders.customerName")}>
                {() => (
                  <CustomerPicker
                    value={name}
                    onChange={setName}
                    onPick={fillFrom}
                    customers={customers}
                  />
                )}
              </Field>
              <Field label={t("orders.phone")}>
                {(id) => (
                  <Input
                    id={id}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01712-345678"
                    autoComplete="off"
                    inputMode="tel"
                  />
                )}
              </Field>
            </div>
            <Field label={t("orders.address")}>
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="১২/ক, মিরপুর রোড, ঢাকা"
                />
              )}
            </Field>

            {/*
              Offered only for someone not already saved. A tick that does
              nothing is one people stop reading, including on the orders
              where it would have mattered.
            */}
            {name.trim() !== "" && !known && (
              <label className="ac-fade-in flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-page px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={saveCustomer}
                  onChange={(e) => setSaveCustomer(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                    <BookmarkPlus size={15} className="text-accent" aria-hidden />
                    {t("orders.saveCustomer")}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-4.5 text-ink-3">
                    {t("orders.saveCustomerHint")}
                  </span>
                </span>
              </label>
            )}
            {name.trim() !== "" && known && (
              <p className="ac-fade-in flex items-center gap-1.5 text-[12px] font-semibold text-good-ink">
                <Check size={14} aria-hidden />
                {t("orders.customerSaved")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <SectionLabel>{t("orders.products")}</SectionLabel>
            {products === undefined ? (
              <div className="ac-skeleton h-11 rounded-xl bg-surface-2" aria-hidden />
            ) : (
              <ProductPicker products={products} onPick={addProduct} />
            )}

            {lines.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-3">{t("orders.noProducts")}</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {parsed.map((line) => {
                  const over = Number.isFinite(line.qty) && line.qty > line.stock;
                  return (
                    <li
                      key={line.key}
                      className={cx(
                        "rounded-xl border bg-page p-3.5",
                        over ? "border-critical/40" : "border-line",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold text-ink">
                            {line.productName}
                          </p>
                          <p
                            className={cx(
                              "mt-0.5 text-[11.5px]",
                              over ? "font-semibold text-critical-ink" : "text-ink-3",
                            )}
                          >
                            {t("orders.inStock")}: {fmtNum(line.stock)} {line.unit}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}
                          aria-label={t("common.delete")}
                          className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-end gap-3">
                        <label className="flex-1">
                          <span className="mb-1 block text-[11px] font-semibold text-ink-3">
                            {t("common.quantity")} ({line.unit})
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) =>
                              setLines((p) =>
                                p.map((l) =>
                                  l.key === line.key ? { ...l, quantity: e.target.value } : l,
                                ),
                              )
                            }
                            className="tabular-nums"
                          />
                        </label>
                        <label className="flex-1">
                          <span className="mb-1 block text-[11px] font-semibold text-ink-3">
                            {t("sales.unitPrice")}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={line.unitPrice}
                            onChange={(e) =>
                              setLines((p) =>
                                p.map((l) =>
                                  l.key === line.key ? { ...l, unitPrice: e.target.value } : l,
                                ),
                              )
                            }
                            className="tabular-nums"
                          />
                        </label>
                        <div className="min-w-24 text-right">
                          <span className="mb-1 block text-[11px] font-semibold text-ink-3">
                            {t("common.total")}
                          </span>
                          <span className="block pt-2.5 text-[15px] font-bold tabular-nums text-ink">
                            {fmt(
                              Number.isFinite(line.qty) && Number.isFinite(line.price)
                                ? line.qty * line.price
                                : 0,
                            )}
                          </span>
                          <span
                            className={cx(
                              "block text-[11px] font-semibold tabular-nums",
                              line.price > line.unitCost ? "text-good-ink" : "text-critical-ink",
                            )}
                          >
                            {Number.isFinite(line.price)
                              ? `${line.price > line.unitCost ? "+" : ""}${fmt(
                                  (line.price - line.unitCost) * (Number.isFinite(line.qty) ? line.qty : 0),
                                )}`
                              : ""}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("orders.discount")}>
                {(id) => (
                  <AmountInput
                    id={id}
                    symbol={CURRENCY_SYMBOL}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    className="text-[18px]"
                  />
                )}
              </Field>
              <Field label={t("orders.delivery")}>
                {(id) => (
                  <AmountInput
                    id={id}
                    symbol={CURRENCY_SYMBOL}
                    value={delivery}
                    onChange={(e) => setDelivery(e.target.value)}
                    placeholder="0"
                    className="text-[18px]"
                  />
                )}
              </Field>
              <Field label={t("orders.payment")}>
                {(id) => (
                  <Select id={id} value={payment} onChange={(e) => setPayment(e.target.value)}>
                    <option value="due">{t("orders.due")}</option>
                    <option value="partial">{t("orders.partial")}</option>
                    <option value="paid">{t("orders.paid")}</option>
                  </Select>
                )}
              </Field>
            </div>

            <div className="rounded-2xl border border-line bg-page p-5">
              <Row label={t("orders.subtotal")} value={fmt(subtotal)} />
              {discountValue > 0 && (
                <Row label={t("orders.discount")} value={`− ${fmt(discountValue)}`} muted />
              )}
              {deliveryValue > 0 && <Row label={t("orders.delivery")} value={fmt(deliveryValue)} muted />}
              <div className="mt-3 flex items-end justify-between gap-4 border-t border-line pt-3">
                <span className="text-[13px] font-bold text-ink">{t("orders.total")}</span>
                <span className="text-[26px] leading-8 font-bold tabular-nums text-ink">
                  {fmt(total)}
                </span>
              </div>
            </div>

            {noMarginLines.length > 0 && (
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-warning-soft p-4">
                <p className="flex items-start gap-2 text-[13px] font-semibold text-ink">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                  {t("orders.noMargin")}
                </p>
                <ul className="mt-1.5 ml-6 list-disc text-[12.5px] text-ink-2">
                  {noMarginLines.map((l) => (
                    <li key={l.key}>
                      {l.productName} — {t("orders.cost")} {fmt(l.unitCost)}, {t("orders.selling")}{" "}
                      {fmt(l.price)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {shortLines.length > 0 && (
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-critical-soft p-4">
                <p className="flex items-start gap-2 text-[13px] font-semibold text-critical-ink">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                  {t("orders.shortStock")}
                </p>
                <ul className="mt-1.5 ml-6 list-disc text-[12.5px] text-ink-2">
                  {shortLines.map((l) => (
                    <li key={l.key}>
                      {l.productName} — {fmtNum(l.qty)} {t("orders.requested")}, {fmtNum(l.stock)}{" "}
                      {t("orders.available")}
                    </li>
                  ))}
                </ul>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">
                    {t("orders.overrideHint")}
                  </span>
                  <div className="relative">
                    <KeyRound
                      size={15}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
                      aria-hidden
                    />
                    <Input
                      type="password"
                      value={override}
                      onChange={(e) => setOverride(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="pl-10"
                    />
                  </div>
                </label>
              </div>
            )}

            <Field label={t("common.note")}>
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("orders.notePlaceholder")}
                />
              )}
            </Field>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {saving ? t("common.saving") : t("orders.saveOrder")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-[13px] text-ink-2">{label}</span>
      <span
        className={cx(
          "text-[14px] font-semibold tabular-nums",
          muted ? "text-ink-2" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
