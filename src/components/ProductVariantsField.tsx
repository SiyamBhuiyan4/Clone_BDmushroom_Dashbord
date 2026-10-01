import { Plus, Trash2 } from "lucide-react";
import { AmountInput, Input, cx } from "./ui";
import { useT } from "../lib/i18n";
import { CURRENCY_SYMBOL } from "../lib/format";

export type StockMode = "separate" | "shared";

/** One size/package row, as the form edits it — strings, parsed on submit. */
export type VariantRow = {
  /** Stable once created, so an order line that points at it never goes stale. */
  id: string;
  label: string;
  costPrice: string;
  sellPrice: string;
  /** Used in "separate" mode. */
  quantity: string;
  /** Used in "shared" mode — how many of the pooled stock one of these is. */
  baseQuantity: string;
};

let rowSeq = 0;

export function newVariantRow(): VariantRow {
  return {
    id: `v${Date.now().toString(36)}${(rowSeq++).toString(36)}`,
    label: "",
    costPrice: "",
    sellPrice: "",
    quantity: "",
    baseQuantity: "",
  };
}

/**
 * The size/package editor for a product that sells in more than one size —
 * "500 gram" at one price, "1 kg" at another. Stock mode decides whether
 * each size counts its own stock or all draw from one shared pool; see the
 * hint text under each option for what that means in practice.
 */
export function ProductVariantsField({
  stockMode,
  onStockModeChange,
  rows,
  onChange,
}: {
  stockMode: StockMode;
  onStockModeChange: (mode: StockMode) => void;
  rows: VariantRow[];
  onChange: (rows: VariantRow[]) => void;
}) {
  const t = useT();

  function update(i: number, patch: Partial<VariantRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onStockModeChange("separate")}
          aria-pressed={stockMode === "separate"}
          className={cx(
            "rounded-xl border px-3 py-2.5 text-left text-[12.5px] font-semibold transition-colors",
            stockMode === "separate"
              ? "border-accent bg-accent-soft text-ink"
              : "border-line-strong bg-page text-ink-2 hover:bg-surface-2",
          )}
        >
          {t("products.stockSeparate")}
        </button>
        <button
          type="button"
          onClick={() => onStockModeChange("shared")}
          aria-pressed={stockMode === "shared"}
          className={cx(
            "rounded-xl border px-3 py-2.5 text-left text-[12.5px] font-semibold transition-colors",
            stockMode === "shared"
              ? "border-accent bg-accent-soft text-ink"
              : "border-line-strong bg-page text-ink-2 hover:bg-surface-2",
          )}
        >
          {t("products.stockShared")}
        </button>
      </div>
      <p className="text-[12px] leading-4.5 text-ink-3">
        {stockMode === "separate" ? t("products.stockSeparateHint") : t("products.stockSharedHint")}
      </p>

      <div className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <div key={row.id} className="flex flex-col gap-2 rounded-xl border border-line bg-page p-3">
            <div className="flex items-center gap-2">
              <Input
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="500 gram"
                autoComplete="off"
                aria-label={t("products.variantLabel")}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                aria-label={t("common.delete")}
                className="shrink-0 rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-critical"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10.5px] font-semibold text-ink-3">
                  {t("products.variantCost")}
                </span>
                <AmountInput
                  symbol={CURRENCY_SYMBOL}
                  value={row.costPrice}
                  onChange={(e) => update(i, { costPrice: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10.5px] font-semibold text-ink-3">
                  {t("products.variantSell")}
                </span>
                <AmountInput
                  symbol={CURRENCY_SYMBOL}
                  value={row.sellPrice}
                  onChange={(e) => update(i, { sellPrice: e.target.value })}
                  placeholder="—"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10.5px] font-semibold text-ink-3">
                  {stockMode === "separate" ? t("products.variantStock") : t("products.variantBaseQty")}
                </span>
                <Input
                  type="number"
                  min={0}
                  step={stockMode === "separate" ? 1 : "any"}
                  inputMode={stockMode === "separate" ? "numeric" : "decimal"}
                  value={stockMode === "separate" ? row.quantity : row.baseQuantity}
                  onChange={(e) =>
                    update(
                      i,
                      stockMode === "separate"
                        ? { quantity: e.target.value }
                        : { baseQuantity: e.target.value },
                    )
                  }
                  placeholder={stockMode === "separate" ? "0" : "500"}
                  className="tabular-nums"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, newVariantRow()])}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-[12.5px] font-semibold text-accent transition-colors hover:brightness-110"
      >
        <Plus size={14} />
        {t("products.addVariant")}
      </button>
    </div>
  );
}
