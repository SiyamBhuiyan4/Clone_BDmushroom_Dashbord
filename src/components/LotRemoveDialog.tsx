import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { cx } from "./ui";
import { useSettings } from "../lib/settings";
import { useToast } from "../lib/toast";
import { useAuthedMutation } from "../lib/session";

export type RemovableLot = {
  id: string;
  label: string;
  quantity: number;
  remaining?: number;
  unitCost: number;
};

/**
 * Taking a lot away asks how: off the product only (a real purchase whose
 * stock is gone — it stays in the vendor's history, and what was left in it
 * is booked as a loss), or deleted everywhere (it was entered by mistake).
 */
export function LotRemoveDialog({ lot, onClose }: { lot: RemovableLot | null; onClose: () => void }) {
  const { fmt, fmtNum } = useSettings();
  const toast = useToast();
  const removeBatch = useAuthedMutation(api.profit.removeBatch);
  const [mode, setMode] = useState<"remove" | "delete">("remove");

  useEffect(() => {
    if (lot) setMode("remove");
  }, [lot]);

  const left = lot ? (lot.remaining ?? lot.quantity) : 0;
  const options = [
    {
      key: "remove" as const,
      title: "Remove from product only",
      body:
        left > 0
          ? `Stays in the vendor's history. The ${fmtNum(left)} left (${fmt(left * (lot?.unitCost ?? 0))}) is counted as a loss.`
          : "Stays in the vendor's history and every report.",
    },
    {
      key: "delete" as const,
      title: "Delete everywhere",
      body: "Entered by mistake — also gone from the vendor's history.",
    },
  ];

  return (
    <PasscodeConfirmDialog
      open={lot !== null}
      onClose={onClose}
      title="Remove stock lot"
      confirmLabel={mode === "remove" ? "Remove" : "Delete"}
      body={lot ? `${lot.label} · ${fmtNum(left)} left of ${fmtNum(lot.quantity)}` : ""}
      onConfirm={async (passcode) => {
        if (!lot) return;
        await removeBatch({ id: lot.id as Id<"stockBatches">, passcode, mode });
        toast.ok(mode === "remove" ? "Lot removed from the product." : "Lot deleted.");
      }}
    >
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <label
            key={o.key}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
              mode === o.key ? "border-accent bg-accent-soft" : "border-line-strong bg-page hover:bg-surface-2",
            )}
          >
            <input
              type="radio"
              name="lot-remove-mode"
              checked={mode === o.key}
              onChange={() => setMode(o.key)}
              className="mt-1 size-4 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-ink">{o.title}</span>
              <span className="mt-0.5 block text-[12px] leading-4.5 text-ink-3">{o.body}</span>
            </span>
          </label>
        ))}
      </div>
    </PasscodeConfirmDialog>
  );
}
