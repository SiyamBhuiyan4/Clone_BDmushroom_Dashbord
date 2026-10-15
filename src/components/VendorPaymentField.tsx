import { AmountInput, SectionLabel, cx } from "./ui";
import { CURRENCY_SYMBOL } from "../lib/format";
import { useSettings } from "../lib/settings";

export type VendorPayment = { status: "paid" | "due" | "partial"; amount: string };

export const PAID_IN_FULL: VendorPayment = { status: "paid", amount: "" };

/**
 * What was paid to the vendor for a new lot, as the amount to send — or
 * undefined for paid in full, which is what the server assumes without one.
 * Null when "partial" has no usable amount yet.
 */
export function vendorPaidAmount(p: VendorPayment, total: number): number | undefined | null {
  if (p.status === "paid") return undefined;
  if (p.status === "due") return 0;
  const value = Number(p.amount);
  if (p.amount.trim() === "" || !Number.isFinite(value) || value <= 0 || value >= total) return null;
  return value;
}

/** Paid / Due / Partial for a lot bought from a vendor — the other side of a customer's payment. */
export function VendorPaymentField({
  value,
  onChange,
  total,
}: {
  value: VendorPayment;
  onChange: (v: VendorPayment) => void;
  total: number;
}) {
  const { fmt } = useSettings();
  const options: { key: VendorPayment["status"]; label: string }[] = [
    { key: "paid", label: "Paid" },
    { key: "due", label: "Not paid" },
    { key: "partial", label: "Part paid" },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>Paid to vendor</SectionLabel>
        <span className="text-[11.5px] tabular-nums text-ink-3">Lot total {fmt(total)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange({ ...value, status: o.key })}
            aria-pressed={value.status === o.key}
            className={cx(
              "rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold transition-colors",
              value.status === o.key
                ? "border-accent bg-accent-soft text-ink"
                : "border-line-strong bg-page text-ink-2 hover:bg-surface-2",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.status === "partial" && (
        <AmountInput
          symbol={CURRENCY_SYMBOL}
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          placeholder="How much was paid"
        />
      )}
    </div>
  );
}
