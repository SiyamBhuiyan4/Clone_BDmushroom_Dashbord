import { Layers, Truck } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge, Modal } from "./ui";
import { LotMediaManager } from "./LotMediaManager";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { useAuthedQuery } from "../lib/session";

const CATEGORY_KEY = {
  spawn: "vendors.categorySpawn",
  materials: "vendors.categoryMaterials",
  equipment: "vendors.categoryEquipment",
  packaging: "vendors.categoryPackaging",
  other: "vendors.categoryOther",
} as const;

/**
 * One lot, in full: its numbers, who it was bought from, and the
 * receipts/photos/videos attached to this specific purchase.
 */
export function LotDetailDialog({
  open,
  onClose,
  lotId,
  onViewVendor,
}: {
  open: boolean;
  onClose: () => void;
  lotId: Id<"stockBatches"> | null;
  /** Lets the caller open the vendor's own profile once this dialog closes. */
  onViewVendor?: (vendorId: Id<"vendors">) => void;
}) {
  const { fmt, fmtDateFull, fmtNum } = useSettings();
  const t = useT();
  const data = useAuthedQuery(api.profit.lotDetail, lotId ? { id: lotId } : "skip");

  const lot = data?.lot;
  const vendor = data?.vendor;
  const unitProfit = lot?.unitPrice !== undefined ? lot.unitPrice - (lot?.unitCost ?? 0) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Layers size={19} />}
      title={lot ? lot.label : t("lot.title")}
      subtitle={lot ? fmtDateFull(lot.purchasedAt) : undefined}
      width="sm:max-w-xl"
    >
      {!data || !lot ? (
        <div className="ac-skeleton h-56 bg-surface" aria-hidden />
      ) : (
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat
              label={t("detail.leftOf")}
              value={`${fmtNum(lot.remaining ?? lot.quantity)}/${fmtNum(lot.quantity)}`}
            />
            <MiniStat label="Buy" value={fmt(lot.unitCost)} />
            <MiniStat
              label="Sell"
              value={lot.unitPrice !== undefined ? fmt(lot.unitPrice) : "—"}
            />
            <MiniStat
              label={t("sales.profit")}
              value={unitProfit === null ? t("detail.priceOpen") : fmt(unitProfit * lot.quantity)}
              tone={unitProfit !== null && unitProfit < 0 ? "critical" : unitProfit !== null ? "good" : undefined}
            />
          </div>

          {/* ------------------------------------------------------ Vendor */}
          <div>
            <p className="mb-2.5 text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
              {t("lot.vendor")}
            </p>
            {vendor ? (
              <button
                onClick={() => {
                  onClose();
                  onViewVendor?.(vendor._id);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-page px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Truck size={16} className="shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {vendor.name}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">
                      {vendor.phone}
                    </span>
                  </span>
                </span>
                <Badge tone="accent">{t(CATEGORY_KEY[vendor.category])}</Badge>
              </button>
            ) : (
              <p className="text-[13px] text-ink-3">{t("lot.noVendor")}</p>
            )}
          </div>

          <LotMediaManager lotId={lot._id} />

          {lot.note && (
            <div className="rounded-2xl border border-line bg-page p-4">
              <p className="text-[13px] leading-6 whitespace-pre-wrap text-ink-2">{lot.note}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "critical";
}) {
  return (
    <div className="rounded-xl border border-line bg-page px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold text-ink-3">{label}</p>
      <p
        className={
          "mt-0.5 truncate text-[14px] font-bold tabular-nums " +
          (tone === "good" ? "text-good-ink" : tone === "critical" ? "text-critical-ink" : "text-ink")
        }
      >
        {value}
      </p>
    </div>
  );
}
