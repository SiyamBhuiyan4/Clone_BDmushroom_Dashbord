import { useEffect, useRef, useState } from "react";
import { Camera, PackagePlus, Pencil, Trash2, Upload } from "lucide-react";
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
  Stepper,
  Textarea,
  cx,
} from "./ui";
import { CURRENCY_SYMBOL } from "../lib/format";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedQuery, useAuthedMutation } from "../lib/session";

type ProductWithPhoto = Doc<"products"> & { photoUrl?: string | null };

type Draft = {
  name: string;
  category: string;
  costPrice: string;
  sellPrice: string;
  quantity: number;
  details: string;
};

const EMPTY: Draft = { name: "", category: "", costPrice: "", sellPrice: "", quantity: 1, details: "" };

function toDraft(product: Doc<"products">): Draft {
  return {
    name: product.name,
    category: product.category ?? "",
    costPrice: String(product.costPrice),
    sellPrice: product.sellPrice !== undefined ? String(product.sellPrice) : "",
    quantity: product.quantity,
    details: product.details,
  };
}

/** POSTs a file to a Convex upload URL and returns the resulting storage id. */
async function uploadFile(uploadUrl: string, file: File): Promise<Id<"_storage">> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("The photo failed to upload. Try again.");
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

export function ProductDialog({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when adding. */
  product?: ProductWithPhoto | null;
}) {
  const t = useT();
  const toast = useToast();
  const create = useAuthedMutation(api.products.create);
  const update = useAuthedMutation(api.products.update);
  const generateUploadUrl = useAuthedMutation(api.products.generateUploadUrl);
  const setPhoto = useAuthedMutation(api.products.setPhoto);
  const removePhoto = useAuthedMutation(api.products.removePhoto);
  const categories = useAuthedQuery(api.products.categories) ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  /*
    The photo is its own small state machine, independent of the rest of the
    form — editing a name and swapping a photo are two different actions that
    happen to live in the same dialog. `savedPhotoUrl` is what the backend
    actually has right now; `photoPreview` is what's on screen, which can
    briefly be a local blob URL while an upload is in flight. Deciding
    whether a photo exists from the `product` prop instead would be wrong —
    that prop is a snapshot from when the dialog opened, so it goes stale the
    moment a photo is uploaded earlier in this same session.
  */
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(product ? toDraft(product) : EMPTY);
    setSavedPhotoUrl(product?.photoUrl ?? null);
    setPhotoPreview(product?.photoUrl ?? null);
    setPendingPhoto(null);
  }, [open, product]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function pickPhoto(file: File) {
    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);

    if (!product) {
      // No product to attach it to yet — uploaded once Save creates one.
      setPendingPhoto(file);
      return;
    }
    setPhotoBusy(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const storageId = await uploadFile(uploadUrl, file);
      await setPhoto({ id: product._id, storageId });
      setSavedPhotoUrl(preview);
      toast.ok(t("products.changePhoto") + ".");
    } catch (err) {
      toast.error(errorMessage(err));
      setPhotoPreview(savedPhotoUrl);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function clearPhoto() {
    if (!product || !savedPhotoUrl) {
      setPhotoPreview(null);
      setPendingPhoto(null);
      return;
    }
    setPhotoBusy(true);
    try {
      await removePhoto({ id: product._id });
      setSavedPhotoUrl(null);
      setPhotoPreview(null);
      toast.ok(t("products.removePhoto") + ".");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  const costPrice = Number(draft.costPrice);
  const sellPrice = draft.sellPrice.trim() === "" ? undefined : Number(draft.sellPrice);
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
        sellPrice,
        details: draft.details,
        category: draft.category,
        quantity: draft.quantity,
      };
      if (product) {
        await update({ id: product._id, ...payload });
        toast.ok(`Updated ${payload.name.trim()}.`);
      } else {
        const id = await create(payload);
        // A photo picked before the product existed uploads now, against
        // the id Save just produced.
        if (pendingPhoto) {
          const uploadUrl = await generateUploadUrl({});
          const storageId = await uploadFile(uploadUrl, pendingPhoto);
          await setPhoto({ id, storageId });
        }
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
          <div className="flex items-center gap-4">
            <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line-strong bg-page">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="size-full object-cover" />
              ) : (
                <Camera size={22} className="text-ink-3" aria-hidden />
              )}
              {photoBusy && (
                <div className="absolute inset-0 flex items-center justify-center bg-page/70">
                  <div className="ac-skeleton size-5 rounded-full" aria-hidden />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickPhoto(file);
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={photoBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  {photoPreview ? t("products.changePhoto") : t("products.uploadPhoto")}
                </Button>
                {photoPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={photoBusy}
                    onClick={() => void clearPhoto()}
                  >
                    <Trash2 size={14} />
                    {t("products.removePhoto")}
                  </Button>
                )}
              </div>
              <p className="text-[11.5px] text-ink-3">
                {photoBusy ? t("products.uploading") : t("products.photo")}
              </p>
            </div>
          </div>

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

            {/*
              Without this, orders had no selling price to prefill and fell
              back to cost — which recorded every sale at zero profit.
            */}
            <div className="mt-2 flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>{t("products.sellPrice")}</SectionLabel>
                <span className="text-[11.5px] text-ink-3">{t("common.optional")}</span>
              </div>
              <AmountInput
                symbol={CURRENCY_SYMBOL}
                value={draft.sellPrice}
                onChange={(e) => set("sellPrice", e.target.value)}
                placeholder="0"
              />
              <p className="text-[12px] leading-4.5 text-ink-3">{t("products.sellPriceHint")}</p>
            </div>

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
