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
  /** The product's own price, or cost when it has none — never the lot's. */
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
  const [variantId, setVariantId] = useState("");
  const [label, setLabel] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (batch) {
      setProductId(batch.productId);
      setLabel(batch.label);
      setPurchasedAt(toLocalInputValue(batch.purchasedAt));
      setQuantity(String(batch.quantity));
      setUnitCost(String(batch.unitCost));
      setNote(batch.note ?? "");
      setVendorId(batch.vendorId ?? "");
    } else {
      setProductId(presetProductId ?? "");
      setVariantId("");
      setLabel("");
      setPurchasedAt(toLocalInputValue(Date.now()));
      setQuantity("");
      setUnitCost("");
      setNote("");
      setVendorId("");
    }
  }, [open, batch, presetProductId]);

  const selected = useMemo(
    () => products?.find((p) => p._id === productId),
    [products, productId],
  );
  // Which size this lot restocks is only asked when creating one — an
  // existing lot's size was fixed the moment it moved real stock, the same
  // reason its product can't be changed here either.
  const needsVariant = !batch && Boolean(selected?.variants?.length);

  const qty = Number(quantity);
  const cost = Number(unitCost);
  const qtyOk = quantity.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const costOk = unitCost.trim() !== "" && Number.isFinite(cost) && cost >= 0;
  const valid =
    Boolean(productId) &&
    (!needsVariant || Boolean(variantId)) &&
    qtyOk &&
    costOk &&
    !saving;

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
        note,
      };
      const vendorArg = vendorId ? (vendorId as Id<"vendors">) : null;
      if (batch) {
        await update({ id: batch.id as Id<"stockBatches">, ...payload, vendorId: vendorArg });
        toast.ok("Stock lot updated.");
      } else {
        await add({
          productId: productId as Id<"products">,
          variantId: needsVariant ? variantId : undefined,
          ...payload,
          vendorId: vendorArg ?? undefined,
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
      subtitle="What this lot cost you — the product's own sell price covers the rest."
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
                onChange={(e) => {
                  setProductId(e.target.value);
                  setVariantId("");
                }}
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

          {needsVariant && (
            <div className="flex flex-col gap-2.5">
              <SectionLabel>Size</SectionLabel>
              <Select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                aria-label="Size"
                required
              >
                <option value="" disabled>
                  Choose a size…
                </option>
                {selected!.variants!.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </Select>
              <p className="text-[12px] leading-4.5 text-ink-3">
                This lot restocks this size only, not the product's other sizes.
              </p>
            </div>
          )}

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
