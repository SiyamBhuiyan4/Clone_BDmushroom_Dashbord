import { useEffect, useState } from "react";
import { ArrowRight, Truck } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button, Field, Input, Modal, ModalFooter, Select, Textarea } from "./ui";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation } from "../lib/session";
import { VENDOR_CATEGORIES, type VendorCategory } from "../../convex/shared";

export function VendorDialog({
  open,
  onClose,
  vendor,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing someone already saved. */
  vendor?: Doc<"vendors"> | null;
}) {
  const t = useT();
  const toast = useToast();
  const create = useAuthedMutation(api.vendors.create);
  const update = useAuthedMutation(api.vendors.update);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<VendorCategory>("spawn");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [tradeLicenseNo, setTradeLicenseNo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(vendor?.name ?? "");
    setCategory(vendor?.category ?? "spawn");
    setPhone(vendor?.phone ?? "");
    setWhatsapp(vendor?.whatsapp ?? "");
    setAddress(vendor?.address ?? "");
    setTin(vendor?.tin ?? "");
    setTradeLicenseNo(vendor?.tradeLicenseNo ?? "");
    setNote(vendor?.note ?? "");
  }, [open, vendor]);

  const valid = name.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = { name, category, phone, whatsapp, address, tin, tradeLicenseNo, note };
      if (vendor) {
        await update({ id: vendor._id, ...payload });
        toast.ok(t("vendors.updated"));
      } else {
        await create(payload);
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
