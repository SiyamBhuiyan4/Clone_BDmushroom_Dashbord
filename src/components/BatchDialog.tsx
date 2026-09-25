import { useEffect, useMemo, useState } from "react";
import { Layers, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
import { useSettings } from "../lib/settings";
import { CURRENCY_SYMBOL, percent, plural, toLocalInputValue } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

/*
  A stock lot as it is stored — nothing derived. The product detail view holds
  the rows straight from the database and has no profit figures to hand, so
  demanding them here would mean computing two numbers the form never reads
  just to open it.
*/
export type BatchInput = {
  id: string;
  productId: string;
  productName: string;
  label: string;
  purchasedAt: number;
  quantity: number;
  unitCost: number;
  /** Absent when the lot was recorded without deciding a price. */
  unitPrice?: number;
  /*
    What is left in the lot. Not edited here — it follows from the quantity
    and what has sold — but a caller about to delete the lot needs it to say
    truthfully how much stock that costs.
  */
  remaining?: number;
  note?: string;
};

/** A lot with the profit the Profit page works out from it. */
export type BatchRow = BatchInput & {
  unitProfit: number;
  totalProfit: number;
};

export function BatchDialog({
  open,
  onClose,
  batch,
  presetProductId,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing lot. */
  batch?: BatchInput | null;
  /** Opened from a product, so the product is already decided. */
  presetProductId?: string;
}) {
  const { fmt } = useSettings();
  const toast = useToast();
  const products = useAuthedQuery(api.products.list, { includeArchived: true });
  const add = useAuthedMutation(api.profit.addBatch);
  const update = useAuthedMutation(api.profit.updateBatch);

  const [productId, setProductId] = useState("");
  const [label, setLabel] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (batch) {
      setProductId(batch.productId);
      setLabel(batch.label);
      setPurchasedAt(toLocalInputValue(batch.purchasedAt));
      setQuantity(String(batch.quantity));
      setUnitCost(String(batch.unitCost));
      setUnitPrice(batch.unitPrice !== undefined ? String(batch.unitPrice) : "");
      setNote(batch.note ?? "");
    } else {
      setProductId(presetProductId ?? "");
      setLabel("");
      setPurchasedAt(toLocalInputValue(Date.now()));
      setQuantity("");
      setUnitCost("");
      setUnitPrice("");
      setNote("");
    }
  }, [open, batch, presetProductId]);

  const selected = useMemo(
    () => products?.find((p) => p._id === productId),
    [products, productId],
  );

  const qty = Number(quantity);
  const cost = Number(unitCost);
  const price = Number(unitPrice);
  const qtyOk = quantity.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const costOk = unitCost.trim() !== "" && Number.isFinite(cost) && cost >= 0;
  // Blank is allowed: a lot can be bought before anyone decides what it sells
  // for, and forcing a number here would invent one.
  const priceOk = unitPrice.trim() === "" || (Number.isFinite(price) && price >= 0);
  const valid = Boolean(productId) && qtyOk && costOk && priceOk && !saving;

  /*
    With no sell price there is no margin to preview — the figures read zero
    rather than pretending the lot sells at cost, and the summary below says
    so in words instead of showing a confident ৳0.
  */
  const priced = unitPrice.trim() !== "" && Number.isFinite(price);
  const ready = qtyOk && costOk && priced;
  const unitProfit = ready ? price - cost : 0;
  const totalProfit = ready ? unitProfit * qty : 0;
  const margin = ready && price > 0 ? unitProfit / price : 0;
  const loss = ready && unitProfit < 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const when = purchasedAt ? new Date(purchasedAt).getTime() : Date.now();
      const payload = {
        label,
        purchasedAt: when,
        quantity: qty,
        unitCost: cost,
        unitPrice: unitPrice.trim() === "" ? undefined : price,
        note,
      };
      if (batch) {
        await update({ id: batch.id as Id<"stockBatches">, ...payload });
        toast.ok("Stock lot updated.");
      } else {
        await add({ productId: productId as Id<"products">, ...payload });
        toast.ok(
          priced
            ? `Added ${label.trim() || "stock lot"} — ${fmt(totalProfit)} profit.`
            : `Added ${label.trim() || "stock lot"}.`,
        );
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Layers size={19} />}
      title={batch ? "Edit stock lot" : "Add stock lot"}
      subtitle="Profit is worked out from the buy and sell price — you never type it."
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-2.5">
            <SectionLabel>Product</SectionLabel>
            {batch ? (
              <Input value={batch.productName} disabled readOnly />
            ) : (
              <Select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                aria-label="Product"
                required
              >
                <option value="" disabled>
                  Choose a product…
                </option>
                {(products ?? []).map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Lot name" hint="e.g. 1st stock, 2nd stock.">
              {(id) => (
                <Input
                  id={id}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="1st stock"
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Purchase date">
              {(id) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={purchasedAt}
                  onChange={(e) => setPurchasedAt(e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Quantity" hint={selected ? `Unit: whatever you count ${selected.name} in.` : undefined}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="20"
                className="tabular-nums"
                required
              />
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <SectionLabel>Buy price (per unit)</SectionLabel>
              <AmountInput
                symbol={CURRENCY_SYMBOL}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>Sell price (per unit)</SectionLabel>
                <span className="text-[11.5px] text-ink-3">Optional</span>
              </div>
              <AmountInput
                symbol={CURRENCY_SYMBOL}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          <div
            className={cx(
              "rounded-2xl border p-5",
              loss ? "border-critical/30 bg-critical-soft" : "border-line bg-page",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-ink-2">Profit per unit</span>
              <span className="text-[14px] font-semibold tabular-nums text-ink">
                {fmt(unitProfit)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-4">
              <span className="text-[13px] text-ink-2">
                {qtyOk ? plural(qty, "unit") : "Quantity"}
              </span>
              <span className="text-[14px] font-semibold tabular-nums text-ink-2">
                × {qtyOk ? qty.toLocaleString() : 0}
              </span>
            </div>
            <div className="mt-3.5 flex items-end justify-between gap-4 border-t border-line pt-3.5">
              <span className="inline-flex items-center gap-2 text-[13px] font-bold text-ink">
                {loss ? (
                  <TrendingDown size={16} className="text-critical" aria-hidden />
                ) : (
                  <TrendingUp size={16} className="text-good" aria-hidden />
                )}
                {!priced ? "Profit" : loss ? "Loss" : "Total profit"}
                {ready && price > 0 && (
                  <span className="text-[12px] font-semibold text-ink-3">{percent(margin)}</span>
                )}
              </span>
              {!priced ? (
                <span className="text-[13px] text-ink-3">Set a sell price to see it</span>
              ) : (
                <span
                  className={cx(
                    "text-[28px] leading-9 font-bold tracking-tight tabular-nums",
                    loss ? "text-critical-ink" : "text-good-ink",
                  )}
                >
                  {loss ? `−${fmt(Math.abs(totalProfit))}` : fmt(totalProfit)}
                </span>
              )}
            </div>
          </div>

          <Field label="Note" hint="Optional.">
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Supplier, invoice number, anything."
              />
            )}
          </Field>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {saving ? "Saving…" : batch ? "Save changes" : "Add stock lot"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
