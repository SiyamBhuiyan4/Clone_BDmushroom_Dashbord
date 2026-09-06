import { useEffect, useState } from "react";
import { PackagePlus, Pencil } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  AmountInput,
  Button,
  Field,
  Input,
  Modal,
  ModalFooter,
  SectionLabel,
  Stepper,
  Textarea,
  cx,
} from "./ui";
import { CURRENCY_SYMBOL } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedQuery, useAuthedMutation } from "../lib/session";

type Draft = {
  name: string;
  category: string;
  costPrice: string;
  quantity: number;
  details: string;
};

const EMPTY: Draft = { name: "", category: "", costPrice: "", quantity: 1, details: "" };

function toDraft(product: Doc<"products">): Draft {
  return {
    name: product.name,
    category: product.category ?? "",
    costPrice: String(product.costPrice),
    quantity: product.quantity,
    details: product.details,
  };
}

export function ProductDialog({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when adding. */
  product?: Doc<"products"> | null;
}) {
  const toast = useToast();
  const create = useAuthedMutation(api.products.create);
  const update = useAuthedMutation(api.products.update);
  const categories = useAuthedQuery(api.products.categories) ?? [];

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(product ? toDraft(product) : EMPTY);
  }, [open, product]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const costPrice = Number(draft.costPrice);
  const valid =
    draft.name.trim().length > 0 &&
    draft.costPrice.trim() !== "" &&
    Number.isFinite(costPrice) &&
    costPrice >= 0 &&
    Number.isInteger(draft.quantity) &&
    draft.quantity >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        costPrice,
        details: draft.details,
        category: draft.category,
        quantity: draft.quantity,
      };
      if (product) {
        await update({ id: product._id, ...payload });
        toast.ok(`Updated ${payload.name.trim()}.`);
      } else {
        await create(payload);
        toast.ok(`Added ${payload.name.trim()}.`);
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
      icon={product ? <Pencil size={18} /> : <PackagePlus size={19} />}
      title={product ? "Edit product" : "Add product"}
      subtitle={
        product
          ? "Past sales keep the cost they were recorded with."
          : "Cost price is what you pay — profit is measured against it."
      }
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-6 px-6 py-6">
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Netflix Premium — 1 month"
                autoComplete="off"
                required
              />
            )}
          </Field>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>Cost price</SectionLabel>
              <span className="text-[11.5px] text-ink-3">What one unit costs you</span>
            </div>
            <AmountInput
              symbol={CURRENCY_SYMBOL}
              value={draft.costPrice}
              onChange={(e) => set("costPrice", e.target.value)}
              placeholder="0"
              required
            />

            <div className="mt-2 flex items-center justify-between gap-4">
              <div>
                <SectionLabel>Quantity in stock</SectionLabel>
                <p className="mt-1 text-[11.5px] text-ink-3">Units available to sell</p>
              </div>
              <div className="w-36">
                <Stepper
                  value={draft.quantity}
                  onChange={(n) => set("quantity", n)}
                  min={0}
                  label="quantity in stock"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>Category</SectionLabel>
              <span className="text-[11.5px] text-ink-3">Optional</span>
            </div>
            <Input
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Streaming"
              autoComplete="off"
              aria-label="Category"
            />
            {categories.length > 0 && (
              // Reusing an existing category is one tap; typing a new one still works.
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {categories.map((c) => {
                  const active = draft.category.trim() === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("category", active ? "" : c)}
                      aria-pressed={active}
                      className={cx(
                        "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors",
                        active
                          ? "bg-accent text-white"
                          : "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Field label="Details" hint="Login, renewal date, warranty — anything you want to remember.">
            {(id) => (
              <Textarea
                id={id}
                rows={4}
                value={draft.details}
                onChange={(e) => set("details", e.target.value)}
                placeholder="Plain text. Shown on the product card."
              />
            )}
          </Field>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || saving}>
            {saving ? "Saving…" : product ? "Save changes" : "Add product"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
