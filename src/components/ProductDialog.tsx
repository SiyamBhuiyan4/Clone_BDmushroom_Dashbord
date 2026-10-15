import { useEffect, useRef, useState } from "react";
import { Camera, PackagePlus, Pencil, Trash2, Upload } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button, Field, Input, Modal, ModalFooter, SectionLabel, Textarea, cx } from "./ui";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedQuery, useAuthedMutation } from "../lib/session";
import { uploadFile, useFileDrop, useUploadProgress } from "../lib/upload";

type ProductWithPhoto = Doc<"products"> & { photoUrl?: string | null };

/*
  Only what a product is. Its stock and prices live on its lots — a product
  is added here, then stocked with a lot.
*/
type Draft = {
  name: string;
  category: string;
  unit: string;
  details: string;
};

const EMPTY: Draft = { name: "", category: "", unit: "", details: "" };

function toDraft(product: Doc<"products">): Draft {
  return {
    name: product.name,
    category: product.category ?? "",
    unit: product.unit ?? "",
    details: product.details,
  };
}

export function ProductDialog({
  open,
  onClose,
  product,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when adding. */
  product?: ProductWithPhoto | null;
  /** Called with the new product's id, so its first lot can be added straight away. */
  onCreated?: (id: Id<"products">) => void;
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
  const uploadStatus = useUploadProgress();
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
      toast.ok(t("products.photoUpdated"));
    } catch (err) {
      toast.error(errorMessage(err));
      setPhotoPreview(savedPhotoUrl);
    } finally {
      setPhotoBusy(false);
    }
  }

  const { dragOver, dropProps } = useFileDrop((file) => void pickPhoto(file));

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
      toast.ok(t("products.photoRemoved"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  const valid = draft.name.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        details: draft.details,
        category: draft.category,
        unit: draft.unit,
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
        onClose();
        onCreated?.(id);
        return;
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
      guardChanges
      open={open}
      onClose={onClose}
      icon={product ? <Pencil size={18} /> : <PackagePlus size={19} />}
      title={product ? "Edit product" : "Add product"}
      subtitle={
        product
          ? "Past sales keep the cost they were recorded with."
          : "Next you'll add its first lot — that's where stock and prices go."
      }
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex items-center gap-4">
            <div
              {...dropProps}
              className={cx(
                "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-page transition-colors",
                dragOver ? "border-accent ring-2 ring-accent" : "border-line-strong",
              )}
            >
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
              {photoBusy && uploadStatus ? (
                <div className="w-48 mt-0.5">
                  <div className="flex items-center justify-between text-[11px] text-ink-3 mb-1">
                    <span>{uploadStatus.stage === "compressing" ? "Compressing..." : "Uploading..."}</span>
                    <span className="font-semibold tabular-nums">{uploadStatus.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-200"
                      style={{ width: `${Math.max(5, uploadStatus.progress)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[11.5px] text-ink-3">
                  {photoBusy ? t("products.uploading") : t("products.photo")}
                </p>
              )}
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

          <Field label={t("products.unit")} hint={t("products.unitHint")}>
            {(id) => (
              <Input
                id={id}
                list="product-unit-suggestions"
                value={draft.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="পিস"
              />
            )}
          </Field>
          <datalist id="product-unit-suggestions">
            <option value="পিস" />
            <option value="কেজি" />
            <option value="গ্রাম" />
            <option value="লিটার" />
            <option value="বক্স" />
            <option value="প্যাকেট" />
          </datalist>

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
