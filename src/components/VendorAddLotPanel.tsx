import { useMemo, useState, type FormEvent, type ChangeEvent } from "react";
import { Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  AmountInput,
  Button,
  Field,
  Input,
  SectionLabel,
  Select,
  Textarea,
} from "./ui";
import { SidePanelCard } from "./SidePanelCard";
import {
  PAID_IN_FULL,
  VendorPaymentField,
  vendorPaidAmount,
  type VendorPayment,
} from "./VendorPaymentField";
import { CURRENCY_SYMBOL, toLocalInputValue } from "../lib/format";
import { useSettings } from "../lib/settings";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

export type VendorAddLotPanelProps = {
  vendorId: Id<"vendors">;
  vendorName: string;
  onClose: () => void;
  onCreated?: (lotId: Id<"stockBatches">) => void;
};

/**
 * Slide-out panel for adding a new stock lot purchased from a specific vendor.
 * Automatically ties the purchase to the vendor, handles partial/full payment,
 * and syncs inventory and investment.
 */
export function VendorAddLotPanel({
  vendorId,
  vendorName,
  onClose,
  onCreated,
}: VendorAddLotPanelProps) {
  const { fmt } = useSettings();
  const toast = useToast();
  const products = useAuthedQuery(api.products.list, {});
  const addBatch = useAuthedMutation(api.profit.addPurchaseCostBatch);

  const [productId, setProductId] = useState("");
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => toLocalInputValue(Date.now()));
  const [vendorPayment, setVendorPayment] = useState<VendorPayment>(PAID_IN_FULL);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => products?.find((p) => p._id === productId),
    [products, productId],
  );

  const handleProductChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    setProductId(nextId);
    const prod = products?.find((p) => p._id === nextId);
    if (prod && prod.sellPrice !== undefined) {
      setUnitPrice(String(prod.sellPrice));
    }
  };

  const qty = Number(quantity);
  const cost = Number(unitCost);
  const price = Number(unitPrice);

  const qtyOk = quantity.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const costOk = unitCost.trim() !== "" && Number.isFinite(cost) && cost >= 0;
  const priceOk = unitPrice.trim() !== "" && Number.isFinite(price) && price >= 0;
  const total = qtyOk && costOk ? qty * cost : 0;

  const paidNow = vendorPaidAmount(vendorPayment, total);
  const paymentOk = paidNow !== null;

  const valid = Boolean(productId) && qtyOk && costOk && priceOk && paymentOk && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;

    setSaving(true);
    try {
      const when = purchasedAt ? new Date(purchasedAt).getTime() : Date.now();
      const id = await addBatch({
        vendorId,
        productId: productId as Id<"products">,
        label: label.trim() || "Stock",
        purchasedAt: when,
        quantity: qty,
        unitCost: cost,
        unitPrice: price,
        note: note.trim() || undefined,
        vendorPaid: paidNow === undefined ? undefined : paidNow,
      });

      const productName = selected?.name || "Product";
      toast.ok(`Lot added for ${productName} (${vendorName})`);
      onCreated?.(id);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanelCard
      icon={<Plus size={18} />}
      title="Add Stock Lot"
      subtitle={vendorName}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Product selector */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Product</SectionLabel>
          <Select
            value={productId}
            onChange={handleProductChange}
            aria-label="Product"
            required
          >
            <option value="" disabled>
              Choose a product…
            </option>
            {(products ?? []).map((p) => {
              const unitStr = p.unit ? ` ${p.unit}` : "";
              const stockStr = `Stock: ${p.quantity}${unitStr}`;
              const retailStr = p.sellPrice !== undefined ? ` • Retail: ${fmt(p.sellPrice)}` : "";
              return (
                <option key={p._id} value={p._id}>
                  {p.name} ({stockStr}{retailStr})
                </option>
              );
            })}
          </Select>

          {selected && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-page px-3 py-2 text-[12px] text-ink-2">
              <span>
                <span className="text-ink-3">Unit:</span>{" "}
                <span className="font-semibold text-ink">{selected.unit || "unit"}</span>
              </span>
              <span className="text-line-strong">•</span>
              <span>
                <span className="text-ink-3">Current stock:</span>{" "}
                <span className="font-semibold text-ink">
                  {selected.quantity} {selected.unit || ""}
                </span>
              </span>
              <span className="text-line-strong">•</span>
              <span>
                <span className="text-ink-3">Suggested retail:</span>{" "}
                <span className="font-semibold text-ink">
                  {selected.sellPrice !== undefined ? fmt(selected.sellPrice) : "Not set"}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Lot name / size */}
        <Field label="Lot name / size" hint="e.g. 1st stock, 500g, 1kg, Batch #1">
          {(id) => (
            <Input
              id={id}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. 1st stock, 500g, 1kg, Batch #1"
              autoComplete="off"
            />
          )}
        </Field>

        {/* Date and Quantity */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            {(id) => (
              <Input
                id={id}
                type="datetime-local"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
                required
              />
            )}
          </Field>

          <Field label={selected?.unit ? `Quantity (${selected.unit})` : "Quantity"}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10"
                className="tabular-nums"
                required
              />
            )}
          </Field>
        </div>

        {/* Cost and Sell Price */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <SectionLabel>Unit cost</SectionLabel>
            <AmountInput
              symbol={CURRENCY_SYMBOL}
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <SectionLabel>Unit sell price</SectionLabel>
            <AmountInput
              symbol={CURRENCY_SYMBOL}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0"
              required
            />
          </div>
        </div>

        {/* Paid to vendor */}
        <VendorPaymentField
          value={vendorPayment}
          onChange={setVendorPayment}
          total={total}
        />

        {/* Total Cost Card */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-page p-4">
          <span className="text-[13px] font-medium text-ink-2">Total purchase cost</span>
          <span className="text-[20px] font-bold tabular-nums text-ink">
            {fmt(total)}
          </span>
        </div>

        {/* Optional note */}
        <Field label="Note" hint="Optional">
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Supplier invoice, delivery note, remarks…"
            />
          )}
        </Field>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || saving}>
            <Plus size={16} />
            {saving ? "Adding lot…" : "Add Stock Lot"}
          </Button>
        </div>
      </form>
    </SidePanelCard>
  );
}

export default VendorAddLotPanel;
