import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ShoppingCart, TrendingDown, TrendingUp } from "lucide-react";
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
  Stepper,
  Textarea,
  cx,
} from "./ui";
import { useSettings } from "../lib/settings";
import { gradientFor, initialOf } from "../lib/avatar";
import { CURRENCY_SYMBOL, percent, plural, toLocalInputValue } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedQuery, useAuthedMutation } from "../lib/session";

export function SellDialog({
  open,
  onClose,
  sale,
  presetProductId,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing sale. */
  sale?: Doc<"sales"> | null;
  presetProductId?: Id<"products">;
}) {
  const { fmt } = useSettings();
  const toast = useToast();
  const products = useAuthedQuery(api.products.list, {});
  const create = useAuthedMutation(api.sales.create);
  const update = useAuthedMutation(api.sales.update);

  const [productId, setProductId] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [buyer, setBuyer] = useState("");
  const [note, setNote] = useState("");
  const [soldAt, setSoldAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (sale) {
      setProductId(sale.productId);
      setUnitPrice(String(sale.unitPrice));
      setQuantity(sale.quantity);
      setBuyer(sale.buyer ?? "");
      setNote(sale.note ?? "");
      setSoldAt(toLocalInputValue(sale.soldAt));
    } else {
      setProductId(presetProductId ?? "");
      setUnitPrice("");
      setQuantity(1);
      setBuyer("");
      setNote("");
      setSoldAt(toLocalInputValue(Date.now()));
    }
  }, [open, sale, presetProductId]);

  const selected = useMemo(
    () => products?.find((p) => p._id === productId),
    [products, productId],
  );

  // When editing, cost is frozen at what it was when the sale was recorded.
  const unitCost = sale ? sale.unitCost : (selected?.costPrice ?? 0);
  // Editing returns this sale's own units to the pool before re-checking.
  const available = (selected?.quantity ?? 0) + (sale ? sale.quantity : 0);
  const productName = sale ? sale.productName : (selected?.name ?? "");

  const price = Number(unitPrice);
  const qtyOk = Number.isInteger(quantity) && quantity >= 1;
  const priceOk = unitPrice.trim() !== "" && Number.isFinite(price) && price >= 0;
  const stockOk = !selected || quantity <= available;
  const valid = Boolean(productId) && priceOk && qtyOk && stockOk;

  // Until a price is typed there is nothing to preview, so every row reads
  // zero rather than showing a cost with no revenue against it.
  const ready = priceOk && qtyOk;
  const totalRevenue = ready ? price * quantity : 0;
  const totalCost = ready ? unitCost * quantity : 0;
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;
  const loss = totalProfit < 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      const when = soldAt ? new Date(soldAt).getTime() : Date.now();
      if (sale) {
        await update({ id: sale._id, unitPrice: price, quantity, buyer, note, soldAt: when });
        toast.ok("Sale updated.");
      } else {
        await create({
          productId: productId as Id<"products">,
          unitPrice: price,
          quantity,
          buyer,
          note,
          soldAt: when,
        });
        toast.ok(
          `Sold ${plural(quantity, "unit")} of ${productName} — ${fmt(totalProfit)} profit.`,
        );
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const sellable = (products ?? []).filter((p) => p.quantity > 0 || p._id === productId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<ShoppingCart size={19} />}
      title={sale ? "Edit sale" : "Record a sale"}
      subtitle={
        sale
          ? "Changing the quantity puts the difference back into stock."
          : "Sell for any amount — profit is the difference from cost."
      }
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-6 px-6 py-6">
          {/* ---------------------------------------------------- Product */}
          <div className="flex flex-col gap-2.5">
            <SectionLabel>Product</SectionLabel>
            {sale ? (
              <ProductRow name={sale.productName} meta={`Cost ${fmt(sale.unitCost)} each`} />
            ) : (
              <>
                <Select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  aria-label="Product"
                  required
                >
                  <option value="" disabled>
                    Choose a product…
                  </option>
                  {sellable.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} — {p.quantity} in stock
                    </option>
                  ))}
                </Select>
                {selected && (
                  <ProductRow
                    name={selected.name}
                    meta={`${plural(available, "unit")} in stock · cost ${fmt(unitCost)} each`}
                  />
                )}
              </>
            )}
          </div>

          {/* ------------------------------------------- Price & quantity */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>Sale price (per unit)</SectionLabel>
              <span className="text-[11.5px] text-ink-3">Any amount you like</span>
            </div>
            <AmountInput
              symbol={CURRENCY_SYMBOL}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0"
              required
            />

            <div className="mt-2 flex items-center justify-between gap-4">
              <div>
                <SectionLabel>Quantity</SectionLabel>
                {!stockOk && (
                  <p className="mt-1 text-[11.5px] font-semibold text-critical-ink">
                    Only {available} available
                  </p>
                )}
              </div>
              <div className="w-36">
                <Stepper
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={selected ? available : undefined}
                  label="quantity"
                />
              </div>
            </div>
          </div>

          {/* Live preview: the number that matters, before committing. */}
          <div
            className={cx(
              "rounded-2xl border p-5 transition-colors",
              loss ? "border-critical/30 bg-critical-soft" : "border-line bg-page",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-ink-2">Revenue</span>
              <span className="text-[14px] font-semibold tabular-nums text-ink">
                {fmt(totalRevenue)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-4">
              <span className="text-[13px] text-ink-2">Cost</span>
              <span className="text-[14px] font-semibold tabular-nums text-ink-2">
                −{fmt(totalCost)}
              </span>
            </div>
            <div className="mt-3.5 flex items-end justify-between gap-4 border-t border-line pt-3.5">
              <span className="inline-flex items-center gap-2 text-[13px] font-bold text-ink">
                {loss ? (
                  <TrendingDown size={16} className="text-critical" aria-hidden />
                ) : (
                  <TrendingUp size={16} className="text-good" aria-hidden />
                )}
                {loss ? "Loss" : "Profit"}
                {totalRevenue > 0 && (
                  <span className="text-[12px] font-semibold text-ink-3">{percent(margin)}</span>
                )}
              </span>
              <span
                className={cx(
                  "text-[28px] leading-9 font-bold tracking-tight tabular-nums",
                  loss ? "text-critical-ink" : "text-good-ink",
                )}
              >
                {loss ? `−${fmt(Math.abs(totalProfit))}` : fmt(totalProfit)}
              </span>
            </div>
          </div>

          {/* --------------------------------------------------- Optional */}
          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <SectionLabel>Details (optional)</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Buyer">
                {(id) => (
                  <Input
                    id={id}
                    value={buyer}
                    onChange={(e) => setBuyer(e.target.value)}
                    placeholder="Who bought it"
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="Date & time">
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={soldAt}
                    onChange={(e) => setSoldAt(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label="Note">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Payment method, delivery details, anything."
                />
              )}
            </Field>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || saving}>
            {saving ? "Saving…" : sale ? "Save changes" : "Record sale"}
            {!saving && <ArrowRight size={16} />}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Confirms what is being sold, with the same colour the product wears elsewhere. */
function ProductRow({ name, meta }: { name: string; meta: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-page px-3.5 py-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
        style={{ background: gradientFor(name) }}
        aria-hidden
      >
        {initialOf(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-ink">{name}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-3">{meta}</p>
      </div>
    </div>
  );
}
