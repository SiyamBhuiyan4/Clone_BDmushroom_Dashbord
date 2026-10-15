import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
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
} from "./ui";
import { LotMediaManager } from "./LotMediaManager";
import { PAID_IN_FULL, VendorPaymentField, vendorPaidAmount, type VendorPayment } from "./VendorPaymentField";
import { useT } from "../lib/i18n";
import { CURRENCY_SYMBOL, toLocalInputValue } from "../lib/format";
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
  /** What one unit of this lot sells for; old lots may not have one yet. */
  unitPrice?: number;
  /*
    What is left in the lot. Not edited here — it follows from the quantity
    and what has sold — but a caller about to delete the lot needs it to say
    truthfully how much stock that costs.
  */
  remaining?: number;
  note?: string;
  /** Who this lot was bought from. */
  vendorId?: string;
};

/** A lot with the profit the Profit page works out from it. */
export type BatchRow = BatchInput & {
  /** The lot's own sell price, or cost for an old lot that has none. */
  projectedPrice: number;
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
  const t = useT();
  const toast = useToast();
  const products = useAuthedQuery(api.products.list, { includeArchived: true });
  const vendors = useAuthedQuery(api.vendors.list, {});
  const add = useAuthedMutation(api.profit.addBatch);
  const update = useAuthedMutation(api.profit.updateBatch);

  const [productId, setProductId] = useState("");
  const [label, setLabel] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [note, setNote] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorPayment, setVendorPayment] = useState<VendorPayment>(PAID_IN_FULL);
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
      setVendorId(batch.vendorId ?? "");
    } else {
      setProductId(presetProductId ?? "");
      setLabel("");
      setPurchasedAt(toLocalInputValue(Date.now()));
      setQuantity("");
      setUnitCost("");
      setUnitPrice("");
      setNote("");
      setVendorId("");
      setVendorPayment(PAID_IN_FULL);
    }
  }, [open, batch, presetProductId]);

  const selected = useMemo(
    () => products?.find((p) => p._id === productId),
    [products, productId],
  );
  const qty = Number(quantity);
  const cost = Number(unitCost);
  const qtyOk = quantity.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const costOk = unitCost.trim() !== "" && Number.isFinite(cost) && cost >= 0;
  const price = Number(unitPrice);
  const priceOk = unitPrice.trim() !== "" && Number.isFinite(price) && price >= 0;
  // Asked only when a lot is created with a vendor; later payments go
  // through the vendor's own page.
  const askPayment = !batch && Boolean(vendorId);
  const paidNow = vendorPaidAmount(vendorPayment, qtyOk && costOk ? qty * cost : 0);
  const valid =
    Boolean(productId) && qtyOk && costOk && priceOk && (!askPayment || paidNow !== null) && !saving;

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
        unitPrice: price,
        note,
      };
      const vendorArg = vendorId ? (vendorId as Id<"vendors">) : null;
      if (batch) {
        await update({ id: batch.id as Id<"stockBatches">, ...payload, vendorId: vendorArg });
        toast.ok("Stock lot updated.");
      } else {
        await add({
          productId: productId as Id<"products">,
          ...payload,
          vendorId: vendorArg ?? undefined,
          vendorPaid: askPayment ? (paidNow ?? undefined) : undefined,
        });
        toast.ok(`Added ${label.trim() || "stock lot"}.`);
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
      subtitle="Stock, buy price and sell price all live on the lot — a size is just a lot of its own."
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

          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>{t("lot.vendor")}</SectionLabel>
              <span className="text-[11.5px] text-ink-3">{t("common.optional")}</span>
            </div>
            <Select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              aria-label={t("lot.vendor")}
            >
              <option value="">{t("lot.noVendor")}</option>
              {(vendors ?? []).map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Lot name / size" hint="e.g. 1st stock, 500 gram, 1 kg.">
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

          <Field label={selected ? `Quantity (${selected.unit || "পিস"})` : "Quantity"}>
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
              <SectionLabel>Sell price (per unit)</SectionLabel>
              <AmountInput
                symbol={CURRENCY_SYMBOL}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0"
                required
              />
            </div>
          </div>

          {askPayment && (
            <VendorPaymentField
              value={vendorPayment}
              onChange={setVendorPayment}
              total={qtyOk && costOk ? qty * cost : 0}
            />
          )}

          {/*
            Only a saved lot has an id to attach a receipt to — a lot being
            created has nothing yet, so this waits for the first save.
          */}
          {batch && <LotMediaManager lotId={batch.id as Id<"stockBatches">} />}

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
