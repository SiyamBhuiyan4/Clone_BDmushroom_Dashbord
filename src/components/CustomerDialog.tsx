import { useEffect, useState } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Field, Input, Modal, ModalFooter, Textarea } from "./ui";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation } from "../lib/session";

/** What the dialog needs to edit someone — the list query's shape, not the row's. */
export type EditableCustomer = {
  _id: Id<"customers">;
  name: string;
  phone?: string;
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
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setAddress(customer?.address ?? "");
  }, [open, customer]);

  const valid = name.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (customer) {
        await update({ id: customer._id, name, phone, address });
        toast.ok(t("customers.updated"));
      } else {
        await create({ name, phone, address });
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
