import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button, Input, Modal } from "./ui";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { useVendorCategories } from "../lib/vendorCategories";

/**
 * The shop's own list of vendor categories: add one, rename one in place,
 * or delete one (its vendors stay, uncategorised).
 */
export function VendorCategoriesDialog({
  open,
  onClose,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  /** Lets the page drop a filter pointing at a category that just went away. */
  onDeleted?: (id: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const { fmtNum } = useSettings();
  const { categories, label, categoryOf } = useVendorCategories();
  const vendors = useAuthedQuery(api.vendors.list, {}) ?? [];
  const create = useAuthedMutation(api.vendorCategories.create);
  const rename = useAuthedMutation(api.vendorCategories.rename);
  const remove = useAuthedMutation(api.vendorCategories.remove);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<Doc<"vendorCategories"> | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewName("");
    setEditingId(null);
  }, [open]);

  const countIn = (id: string) => vendors.filter((v) => categoryOf(v)?._id === id).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await create({ name: newName });
      toast.ok(`Added ${newName.trim()}.`);
      setNewName("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function saveRename(id: Id<"vendorCategories">) {
    try {
      await rename({ id, name: editName });
      setEditingId(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Tags size={19} />}
      title={t("vendors.categoriesTitle")}
      subtitle={t("vendors.categoriesSubtitle")}
      width="sm:max-w-lg"
    >
      <div className="flex flex-col gap-4 px-6 py-6">
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li key={c._id} className="flex items-center gap-2 rounded-xl border border-line bg-page px-3.5 py-2.5">
              {editingId === c._id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveRename(c._id);
                  }}
                >
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9"
                    autoFocus
                    aria-label={t("common.edit")}
                  />
                  <button
                    type="submit"
                    aria-label={t("common.done")}
                    className="rounded-lg p-1.5 text-good-ink hover:bg-surface-2"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label={t("common.cancel")}
                    className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
                  >
                    <X size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{label(c)}</p>
                    <p className="text-[11.5px] text-ink-3">
                      {fmtNum(countIn(c._id))} {t("vendors.vendorsIn")}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingId(c._id);
                      setEditName(label(c));
                    }}
                    aria-label={`${t("common.edit")} ${label(c)}`}
                    className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleting(c)}
                    aria-label={`${t("common.delete")} ${label(c)}`}
                    className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={add} className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("vendors.newCategory")}
            className="h-10"
          />
          <Button type="submit" size="sm" variant="primary" disabled={!newName.trim() || adding}>
            <Plus size={15} />
            {t("common.add")}
          </Button>
        </form>
      </div>

      <PasscodeConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("vendors.deleteCategory")}
        confirmLabel={t("common.delete")}
        body={
          deleting
            ? `${label(deleting)} · ${fmtNum(countIn(deleting._id))} ${t("vendors.vendorsIn")}\n${t("vendors.deleteCategoryBody")}`
            : ""
        }
        onConfirm={async (passcode) => {
          if (!deleting) return;
          await remove({ id: deleting._id, passcode });
          onDeleted?.(deleting._id);
          toast.ok(`${label(deleting)} deleted.`);
        }}
      />
    </Modal>
  );
}
