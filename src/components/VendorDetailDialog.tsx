import { useRef, useState } from "react";
import {
  ArrowLeft,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Phone,
  Trash2,
  Truck,
  Upload,
  Video as VideoIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge, Button, Input, Modal } from "./ui";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { useT } from "../lib/i18n";
import { gradientFor } from "../lib/avatar";
import { plural } from "../lib/format";
import { whatsappUrl } from "../../convex/shared";
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

export function VendorDetailDialog({
  open,
  onClose,
  vendorId,
}: {
  open: boolean;
  onClose: () => void;
  vendorId: Id<"vendors"> | null;
}) {
  const t = useT();
  const toast = useToast();
  const data = useAuthedQuery(api.vendors.detail, vendorId ? { id: vendorId } : "skip");
  const createFolder = useAuthedMutation(api.vendors.createFolder);
  const removeFolder = useAuthedMutation(api.vendors.removeFolder);
  const generateUploadUrl = useAuthedMutation(api.vendors.generateUploadUrl);
  const attachMedia = useAuthedMutation(api.vendors.attachMedia);
  const removeMedia = useAuthedMutation(api.vendors.removeMedia);

  const [openFolderId, setOpenFolderId] = useState<Id<"vendorFolders"> | "unfiled" | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<Doc<"vendorFolders"> | null>(null);
  const [deletingMedia, setDeletingMedia] = useState<{ id: Id<"vendorMedia">; fileName: string } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const name = data?.vendor.name ?? "";
  const isUnfiledView = openFolderId === "unfiled";
  const openFolder =
    openFolderId && !isUnfiledView ? (data?.folders.find((f) => f._id === openFolderId) ?? null) : null;
  // Files a lot's "upload new" put straight into the vendor's library with no
  // folder — still real files in the gallery, just not filed anywhere yet.
  const unfiledMedia = data?.media.filter((m) => !m.folderId) ?? [];
  const folderMedia = isUnfiledView
    ? unfiledMedia
    : (data?.media.filter((m) => m.folderId === openFolderId) ?? []);
  const viewingContents = openFolderId !== null;

  async function handleUpload(file: File) {
    if (!vendorId || openFolderId === null) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const storageId = await uploadFile(uploadUrl, file);
      await attachMedia({
        vendorId,
        folderId: isUnfiledView ? undefined : (openFolderId as Id<"vendorFolders">),
        storageId,
        fileName: file.name,
        kind: mediaKindOf(file),
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function submitNewFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId || !newFolderName.trim()) return;
    try {
      await createFolder({ vendorId, name: newFolderName });
      setNewFolderName("");
      setNewFolderOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setOpenFolderId(null);
        onClose();
      }}
      icon={<Truck size={19} />}
      gradient={name ? gradientFor(name) : undefined}
      title={name || t("vendors.title")}
      subtitle={data ? t(CATEGORY_KEY[data.vendor.category]) : undefined}
      width="sm:max-w-2xl"
    >
      {!data ? (
        <div className="ac-skeleton h-64 bg-surface" aria-hidden />
      ) : (
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-2">
            {data.vendor.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} className="text-ink-3" aria-hidden />
                {data.vendor.phone}
              </span>
            )}
            {whatsappUrl(data.vendor.whatsapp ?? data.vendor.phone) && (
              <a
                href={whatsappUrl(data.vendor.whatsapp ?? data.vendor.phone)!}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-semibold text-good-ink hover:underline"
              >
                <MessageCircle size={14} aria-hidden />
                {t("customers.whatsapp")}
              </a>
            )}
            {data.vendor.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} className="text-ink-3" aria-hidden />
                {data.vendor.address}
              </span>
            )}
          </div>

          {(data.vendor.tin || data.vendor.tradeLicenseNo) && (
            <div className="grid grid-cols-2 gap-3">
              {data.vendor.tin && (
                <div className="rounded-xl border border-line bg-page px-3.5 py-3">
                  <p className="text-[11px] font-semibold text-ink-3">{t("vendors.tin")}</p>
                  <p className="mt-1 text-[14px] font-bold tabular-nums text-ink">{data.vendor.tin}</p>
                </div>
              )}
              {data.vendor.tradeLicenseNo && (
                <div className="rounded-xl border border-line bg-page px-3.5 py-3">
                  <p className="text-[11px] font-semibold text-ink-3">{t("vendors.tradeLicense")}</p>
                  <p className="mt-1 truncate text-[14px] font-bold text-ink">
                    {data.vendor.tradeLicenseNo}
                  </p>
                </div>
              )}
            </div>
          )}

          {data.vendor.note && (
            <div className="rounded-2xl border border-line bg-page p-4">
              <p className="text-[13px] leading-6 whitespace-pre-wrap text-ink-2">{data.vendor.note}</p>
            </div>
          )}

          {/* ----------------------------------------------------- Gallery */}
          <div>
            {!viewingContents ? (
              <>
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <p className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
                    {t("vendors.gallery")}
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => setNewFolderOpen((v) => !v)}>
                    <FolderPlus size={15} />
                    {t("vendors.newFolder")}
                  </Button>
                </div>
                {newFolderOpen && (
                  <form onSubmit={submitNewFolder} className="mb-3 flex items-center gap-2">
                    <Input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder={t("vendors.folderName")}
                      className="h-10"
                    />
                    <Button type="submit" size="sm" variant="primary" disabled={!newFolderName.trim()}>
                      {t("common.add")}
                    </Button>
                  </form>
                )}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {data.folders.map((f) => {
                    const count = data.media.filter((m) => m.folderId === f._id).length;
                    return (
                      <button
                        key={f._id}
                        onClick={() => setOpenFolderId(f._id)}
                        className="flex flex-col items-start gap-2 rounded-xl border border-line bg-page px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
                      >
                        <Folder size={20} className="text-accent" aria-hidden />
                        <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
                          {f.name}
                        </span>
                        <span className="text-[11px] text-ink-3">{plural(count, "file")}</span>
                      </button>
                    );
                  })}
                  {/* Only shown once something actually lands here — an empty
                      pseudo-folder next to real ones would just be noise. */}
                  {unfiledMedia.length > 0 && (
                    <button
                      onClick={() => setOpenFolderId("unfiled")}
                      className="flex flex-col items-start gap-2 rounded-xl border border-line bg-page px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <Folder size={20} className="text-ink-3" aria-hidden />
                      <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
                        {t("vendors.unfiled")}
                      </span>
                      <span className="text-[11px] text-ink-3">{plural(unfiledMedia.length, "file")}</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setOpenFolderId(null)}
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"
                  >
                    <ArrowLeft size={15} />
                    {isUnfiledView ? t("vendors.unfiled") : openFolder?.name}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} />
                      {uploading ? t("vendors.uploading") : t("vendors.upload")}
                    </Button>
                    {openFolder && (
                      <button
                        onClick={() => setDeletingFolder(openFolder)}
                        aria-label={t("vendors.deleteFolder")}
                        className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-critical"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
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
                {folderMedia.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
                    <p className="text-[13px] font-semibold text-ink-2">{t("vendors.empty")}</p>
                    <p className="mt-1 text-[12px] text-ink-3">{t("vendors.emptyBody")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {folderMedia.map((m) => (
                      <div key={m._id} className="group relative overflow-hidden rounded-xl border border-line bg-page">
                        {m.url && m.kind === "image" ? (
                          <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                        ) : m.url ? (
                          <video src={m.url} controls className="aspect-square w-full bg-black object-contain" />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center text-ink-3">
                            {m.kind === "video" ? <VideoIcon size={22} /> : <ImageIcon size={22} />}
                          </div>
                        )}
                        <button
                          onClick={() => setDeletingMedia({ id: m._id, fileName: m.fileName })}
                          aria-label={`${t("vendors.deleteFile")} — ${m.fileName}`}
                          className="absolute top-1.5 right-1.5 rounded-lg bg-page/90 p-1.5 text-ink-3 opacity-0 backdrop-blur-sm transition-opacity hover:text-critical group-hover:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {data.lots.length > 0 && (
            <div>
              <p className="mb-2.5 text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
                {t("vendors.lotsBought")}
              </p>
              <ul className="flex flex-col gap-2">
                {data.lots.map((l) => (
                  <li
                    key={l._id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-page px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">{l.productName}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">
                        <Badge tone="accent">{l.label}</Badge>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <PasscodeConfirmDialog
        open={deletingFolder !== null}
        onClose={() => setDeletingFolder(null)}
        title={t("vendors.deleteFolder")}
        confirmLabel={t("vendors.deleteFolder")}
        body={deletingFolder ? `${deletingFolder.name}\n${t("vendors.deleteFolderBody")}` : ""}
        onConfirm={async (passcode) => {
          if (!deletingFolder) return;
          await removeFolder({ id: deletingFolder._id, passcode });
          setOpenFolderId(null);
        }}
      />
      <PasscodeConfirmDialog
        open={deletingMedia !== null}
        onClose={() => setDeletingMedia(null)}
        title={t("vendors.deleteFile")}
        confirmLabel={t("vendors.deleteFile")}
        body={deletingMedia ? `${deletingMedia.fileName}\n${t("vendors.deleteFileBody")}` : ""}
        onConfirm={async (passcode) => {
          if (!deletingMedia) return;
          await removeMedia({ id: deletingMedia.id, passcode });
        }}
      />
    </Modal>
  );
}
