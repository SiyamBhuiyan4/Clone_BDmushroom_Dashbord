import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Globe, Trash2, Truck, Upload } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button, Field, Input, Modal, ModalFooter, Select, Textarea, cx } from "./ui";
import { PhoneListField } from "./PhoneListField";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation } from "../lib/session";
import { VENDOR_CATEGORIES, type VendorCategory } from "../../convex/shared";
import { uploadFile, useFileDrop } from "../lib/upload";

/** What the dialog needs to edit a vendor — the list query's shape, not the row's. */
export type EditableVendor = Doc<"vendors"> & { photoUrl?: string | null };

export function VendorDialog({
  open,
  onClose,
  vendor,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing someone already saved. */
  vendor?: EditableVendor | null;
}) {
  const t = useT();
  const toast = useToast();
  const create = useAuthedMutation(api.vendors.create);
  const update = useAuthedMutation(api.vendors.update);
  const generateUploadUrl = useAuthedMutation(api.vendors.generateUploadUrl);
  const setPhotoMutation = useAuthedMutation(api.vendors.setPhoto);
  const removePhotoMutation = useAuthedMutation(api.vendors.removePhoto);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<VendorCategory>("spawn");
  const [phone, setPhone] = useState("");
  const [extraPhones, setExtraPhones] = useState<string[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [tradeLicenseNo, setTradeLicenseNo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  /* Same independent-of-the-prop state machine as ProductDialog's photo —
     see the comment there for why `vendor.photoUrl` alone is not enough. */
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(vendor?.name ?? "");
    setCategory(vendor?.category ?? "spawn");
    setPhone(vendor?.phone ?? "");
    setExtraPhones(vendor?.extraPhones ?? []);
    setWhatsapp(vendor?.whatsapp ?? "");
    setFacebookUrl(vendor?.facebookUrl ?? "");
    setAddress(vendor?.address ?? "");
    setTin(vendor?.tin ?? "");
    setTradeLicenseNo(vendor?.tradeLicenseNo ?? "");
    setNote(vendor?.note ?? "");
    setSavedPhotoUrl(vendor?.photoUrl ?? null);
    setPhotoPreview(vendor?.photoUrl ?? null);
    setPendingPhoto(null);
  }, [open, vendor]);

  const valid = name.trim() !== "";

  async function pickPhoto(file: File) {
    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);

    if (!vendor) {
      // No vendor to attach it to yet — uploaded once Save creates one.
      setPendingPhoto(file);
      return;
    }
    setPhotoBusy(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const storageId = await uploadFile(uploadUrl, file);
      await setPhotoMutation({ id: vendor._id, storageId });
      setSavedPhotoUrl(preview);
      toast.ok(t("contacts.photoUpdated"));
    } catch (err) {
      toast.error(errorMessage(err));
      setPhotoPreview(savedPhotoUrl);
    } finally {
      setPhotoBusy(false);
    }
  }

  const { dragOver, dropProps } = useFileDrop((file) => void pickPhoto(file));

  async function clearPhoto() {
    if (!vendor || !savedPhotoUrl) {
      setPhotoPreview(null);
      setPendingPhoto(null);
      return;
    }
    setPhotoBusy(true);
    try {
      await removePhotoMutation({ id: vendor._id });
      setSavedPhotoUrl(null);
      setPhotoPreview(null);
      toast.ok(t("contacts.photoRemoved"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = {
        name,
        category,
        phone,
        extraPhones,
        whatsapp,
        facebookUrl,
        address,
        tin,
        tradeLicenseNo,
        note,
      };
      if (vendor) {
        await update({ id: vendor._id, ...payload });
        toast.ok(t("vendors.updated"));
      } else {
        const id = await create(payload);
        // A photo picked before the vendor existed uploads now, against
        // the id Save just produced.
        if (pendingPhoto) {
          const uploadUrl = await generateUploadUrl({});
          const storageId = await uploadFile(uploadUrl, pendingPhoto);
          await setPhotoMutation({ id, storageId });
        }
        toast.ok(t("vendors.added"));
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
      icon={<Truck size={19} />}
      title={vendor ? t("vendors.editTitle") : t("vendors.addTitle")}
      subtitle={vendor ? t("vendors.editSubtitle") : t("vendors.addSubtitle")}
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 px-6 py-6">
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
                  {photoPreview ? t("contacts.changePhoto") : t("contacts.uploadPhoto")}
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
                    {t("contacts.removePhoto")}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Field label={t("vendors.name")}>
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sundarban Spawn House"
                autoComplete="off"
                required
              />
            )}
          </Field>

          <Field label={t("vendors.category")}>
            {(id) => (
              <Select
                id={id}
                value={category}
                onChange={(e) => setCategory(e.target.value as VendorCategory)}
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`vendors.category${c[0].toUpperCase()}${c.slice(1)}` as never)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("orders.phone")}>
              {(id) => (
                <Input
                  id={id}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01712-345678"
                  autoComplete="off"
                  inputMode="tel"
                />
              )}
            </Field>
            <Field label={t("customers.whatsapp")} hint={t("common.optional")}>
              {(id) => (
                <Input
                  id={id}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="01812-345678"
                  autoComplete="off"
                  inputMode="tel"
                />
              )}
            </Field>
          </div>

          <PhoneListField phones={extraPhones} onChange={setExtraPhones} />

          <Field label={t("contacts.facebook")} hint={t("contacts.facebookHint")}>
            {(id) => (
              <div className="relative">
                <Globe
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
                  aria-hidden
                />
                <Input
                  id={id}
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  placeholder="facebook.com/sundarban.spawn"
                  autoComplete="off"
                  className="pl-10"
                  inputMode="url"
                />
              </div>
            )}
          </Field>

          <Field label={t("orders.address")}>
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="১২/ক, মিরপুর রোড, ঢাকা"
              />
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("vendors.tin")} hint={t("common.optional")}>
              {(id) => (
                <Input
                  id={id}
                  value={tin}
                  onChange={(e) => setTin(e.target.value)}
                  placeholder="123456789012"
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label={t("vendors.tradeLicense")} hint={t("common.optional")}>
              {(id) => (
                <Input
                  id={id}
                  value={tradeLicenseNo}
                  onChange={(e) => setTradeLicenseNo(e.target.value)}
                  placeholder="TRAD/DNCC/123456/2026"
                  autoComplete="off"
                />
              )}
            </Field>
          </div>

          <Field label={t("common.note")} hint={t("common.optional")}>
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything worth remembering about them."
              />
            )}
          </Field>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || saving}>
            {saving ? t("common.saving") : vendor ? t("common.save") : t("vendors.add")}
            {!saving && <ArrowRight size={16} />}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
