import { useRef, useState } from "react";
import {
  Check,
  Image as ImageIcon,
  Layers,
  Link2,
  Trash2,
  Truck,
  Upload,
  Video as VideoIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge, Button, Modal } from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { mediaKindOf, uploadFile } from "../lib/upload";

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
  const toast = useToast();
  const data = useAuthedQuery(api.profit.lotDetail, lotId ? { id: lotId } : "skip");
  const vendorData = useAuthedQuery(
    api.vendors.detail,
    data?.vendor ? { id: data.vendor._id } : "skip",
  );
  const generateUploadUrl = useAuthedMutation(api.vendors.generateUploadUrl);
  const attachVendorMedia = useAuthedMutation(api.vendors.attachMedia);
  const attachLotMedia = useAuthedMutation(api.profit.attachLotMedia);
  const removeLotMedia = useAuthedMutation(api.profit.removeLotMedia);

  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lot = data?.lot;
  const vendor = data?.vendor;
  const attachedIds = new Set((data?.media ?? []).map((m) => m._id));
  const pickable = (vendorData?.media ?? []).filter((m) => !attachedIds.has(m._id));

  async function handleUpload(file: File) {
    if (!lotId || !vendor) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const storageId = await uploadFile(uploadUrl, file);
      const mediaId = await attachVendorMedia({
        vendorId: vendor._id,
        storageId,
        fileName: file.name,
        kind: mediaKindOf(file),
      });
      await attachLotMedia({ lotId, mediaId });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleAttachExisting(mediaId: Id<"vendorMedia">) {
    if (!lotId) return;
    try {
      await attachLotMedia({ lotId, mediaId });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function handleDetach(mediaId: Id<"vendorMedia">) {
    if (!lotId) return;
    try {
      await removeLotMedia({ lotId, mediaId });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const unitProfit = lot?.unitPrice !== undefined ? lot.unitPrice - (lot?.unitCost ?? 0) : null;

  return (
    <Modal
      open={open}
      onClose={() => {
        setPicking(false);
        onClose();
      }}
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

          {/* ------------------------------------------------------- Media */}
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
                {t("lot.media")}
              </p>
              {vendor && (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setPicking((v) => !v)}>
                    <Link2 size={14} />
                    {t("lot.attachExisting")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={14} />
                    {uploading ? t("vendors.uploading") : t("lot.uploadNew")}
                  </Button>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleUpload(file);
              }}
            />

            {!vendor ? (
              <p className="text-[13px] text-ink-3">{t("lot.needVendorFirst")}</p>
            ) : picking ? (
              <div className="rounded-xl border border-line bg-page p-2">
                {pickable.length === 0 ? (
                  <p className="px-2 py-3 text-[13px] text-ink-3">{t("lot.noFiles")}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {pickable.map((m) => (
                      <button
                        key={m._id}
                        onClick={() => void handleAttachExisting(m._id)}
                        className="group relative overflow-hidden rounded-lg border border-line"
                      >
                        {m.url && m.kind === "image" ? (
                          <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center bg-surface-2 text-ink-3">
                            <VideoIcon size={18} />
                          </div>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition-all group-hover:bg-ink/40 group-hover:opacity-100">
                          <Check size={18} className="text-white" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : data.media.length === 0 ? (
              <p className="text-[13px] text-ink-3">{t("lot.noMedia")}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {data.media.map((m) => (
                  <div key={m._id} className="group relative overflow-hidden rounded-lg border border-line bg-page">
                    {m.url && m.kind === "image" ? (
                      <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                    ) : m.url ? (
                      <video src={m.url} controls className="aspect-square w-full bg-black object-contain" />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center text-ink-3">
                        <ImageIcon size={18} />
                      </div>
                    )}
                    <button
                      onClick={() => void handleDetach(m._id)}
                      aria-label={`${t("lot.detach")} — ${m.fileName}`}
                      className="absolute top-1 right-1 rounded-md bg-page/90 p-1 text-ink-3 opacity-0 backdrop-blur-sm transition-opacity hover:text-critical group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
