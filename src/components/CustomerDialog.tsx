import { useEffect, useState } from "react";
import { ArrowRight, Globe, MessageCircle, UserRound } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Field, Input, Modal, ModalFooter, Textarea } from "./ui";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation } from "../lib/session";
import { normalisePhone } from "../../convex/shared";

/** What the dialog needs to edit someone — the list query's shape, not the row's. */
export type EditableCustomer = {
  _id: Id<"customers">;
  name: string;
  phone?: string;
  whatsapp?: string;
  facebookUrl?: string;
  address?: string;
};

/**
 * Adds or corrects a customer by hand.
 *
 * The phone is the one field that carries weight: it is what decides whether
 * two entries are the same person, here and everywhere else. Saving without
 * one is allowed — plenty of counter customers never give a number — but then
 * the name has to do that job, and two people sharing a name will collide.
 */
export function CustomerDialog({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing someone already saved. */
  customer?: EditableCustomer | null;
}) {
  const t = useT();
  const toast = useToast();
  const create = useAuthedMutation(api.customers.create);
  const update = useAuthedMutation(api.customers.update);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [address, setAddress] = useState("");
  /*
    On by default, because in this trade the phone and the WhatsApp number are
    the same one far more often than not. Ticked, the field follows the phone
    rather than holding a stale copy of it — so correcting the phone corrects
    both, which is the whole reason the tick exists.
  */
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setWhatsapp(customer?.whatsapp ?? "");
    setFacebookUrl(customer?.facebookUrl ?? "");
    setAddress(customer?.address ?? "");
    /*
      Editing starts ticked only when the two numbers really are the same
      one — compared as digits, so "+8801711…" and "01711-…" count as equal.
      A customer with a separate WhatsApp number keeps it.
    */
    setSameWhatsapp(
      customer
        ? !customer.whatsapp ||
            normalisePhone(customer.whatsapp) === normalisePhone(customer.phone)
        : true,
    );
  }, [open, customer]);

  // What actually gets saved: the phone when the box is ticked, otherwise
  // whatever was typed in the WhatsApp field.
  const whatsappValue = sameWhatsapp ? phone : whatsapp;

  const valid = name.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = { name, phone, whatsapp: whatsappValue, facebookUrl, address };
      if (customer) {
        await update({ id: customer._id, ...payload });
        toast.ok(t("customers.updated"));
      } else {
        await create(payload);
        toast.ok(t("customers.added"));
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
      icon={<UserRound size={19} />}
      title={customer ? t("customers.editTitle") : t("customers.addTitle")}
      subtitle={customer ? t("customers.editSubtitle") : t("customers.addSubtitle")}
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 px-6 py-6">
          <Field label={t("orders.customerName")}>
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="মোঃ রিফাত হোসেন"
                autoComplete="off"
                required
              />
            )}
          </Field>
          <Field label={t("orders.phone")} hint={t("customers.phoneHint")}>
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
          {/* ------------------------------------------------- WhatsApp */}
          <div className="flex flex-col gap-2.5">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-page px-3.5 py-3">
              <input
                type="checkbox"
                checked={sameWhatsapp}
                onChange={(e) => setSameWhatsapp(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                  <MessageCircle size={15} className="text-accent" aria-hidden />
                  {t("customers.sameWhatsapp")}
                </span>
                <span className="mt-0.5 block text-[12px] leading-4.5 text-ink-3">
                  {sameWhatsapp && phone.trim()
                    ? `${t("customers.whatsapp")}: ${phone.trim()}`
                    : t("customers.sameWhatsappHint")}
                </span>
              </span>
            </label>

            {!sameWhatsapp && (
              <Field label={t("customers.whatsapp")}>
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
            )}
          </div>

          <Field label={t("customers.facebook")} hint={t("customers.facebookHint")}>
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
                  placeholder="facebook.com/rahim.store"
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
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || saving}>
            {saving ? t("common.saving") : customer ? t("common.save") : t("customers.add")}
            {!saving && <ArrowRight size={16} />}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
