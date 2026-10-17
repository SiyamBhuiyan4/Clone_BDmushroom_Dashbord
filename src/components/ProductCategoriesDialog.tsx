import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button, Input, Modal } from "./ui";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { useProductCategories } from "../lib/productCategories";

export function ProductCategoriesDialog({
  open,
  onClose,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const { categories, subcategoriesOf, label } = useProductCategories();
  const products = useAuthedQuery(api.products.list, {}) ?? [];
  const create = useAuthedMutation(api.productCategories.create);
  const rename = useAuthedMutation(api.productCategories.rename);
  const remove = useAuthedMutation(api.productCategories.remove);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<Doc<"productCategories"> | null>(null);

  // Sub-category state
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const countIn = (categoryId: string) =>
    products.filter((p) => p.categoryId === categoryId || p.subCategoryId === categoryId).length;

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      await create({ name });
      setNewName("");
      toast.ok("Category added.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function addSubCategory(parentId: Id<"productCategories">) {
    const name = newSubName.trim();
    if (!name) return;
    try {
      await create({ name, parentId });
      setNewSubName("");
      setAddingSubFor(null);
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
      toast.ok("Sub-category added.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function saveRename(id: Id<"productCategories">) {
    const name = editName.trim();
    if (!name) return;
    try {
      await rename({ id, name });
      setEditingId(null);
      toast.ok("Category renamed.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function confirmDelete(passcode: string) {
    if (!deleting) return;
    try {
      await remove({ id: deleting._id, passcode });
      onDeleted?.(deleting._id);
      toast.ok("Category removed.");
      setDeleting(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Layers size={19} />}
      title={t("products.categoriesTitle")}
      subtitle={t("products.categoriesSubtitle")}
      width="sm:max-w-xl"
    >
      <div className="flex flex-col gap-4 px-6 py-6 max-h-[75vh] overflow-y-auto">
        <ul className="flex flex-col gap-3">
          {categories.map((c) => {
            const subcats = subcategoriesOf(c._id);
            const isExpanded = expanded[c._id] ?? true;
            return (
              <li
                key={c._id}
                className="flex flex-col rounded-2xl border border-line bg-page overflow-hidden shadow-xs"
              >
                {/* Main Category Header Row */}
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-surface/50 border-b border-line/60">
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
                        className="h-8.5 text-[13px]"
                        autoFocus
                      />
                      <button
                        type="submit"
                        aria-label={t("common.done")}
                        className="rounded-lg p-1 text-good-ink hover:bg-surface-2"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label={t("common.cancel")}
                        className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"
                      >
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleExpand(c._id)}
                          className="p-1 rounded-md text-ink-3 hover:text-ink hover:bg-surface-2"
                        >
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                        <span className="truncate text-[14px] font-bold text-ink">
                          {label(c)}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-ink-3 tabular-nums">
                          ({countIn(c._id)} products)
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAddingSubFor(c._id);
                            setNewSubName("");
                            setExpanded((prev) => ({ ...prev, [c._id]: true }));
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] font-semibold text-accent hover:bg-accent-soft"
                        >
                          <Plus size={13} />
                          {t("products.addSubCategory")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(c._id);
                            setEditName(label(c));
                          }}
                          aria-label={t("common.edit")}
                          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(c)}
                          aria-label={t("common.delete")}
                          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Sub-categories Container */}
                {isExpanded && (
                  <div className="px-4 py-2.5 flex flex-col gap-1.5 bg-page">
                    {subcats.length === 0 && addingSubFor !== c._id ? (
                      <p className="text-[12px] italic text-ink-3 py-1 pl-6">
                        {t("products.noSubCategory")}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1 pl-4">
                        {subcats.map((sub) => (
                          <li
                            key={sub._id}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface/70 border border-line/40 text-[12.5px]"
                          >
                            {editingId === sub._id ? (
                              <form
                                className="flex flex-1 items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void saveRename(sub._id);
                                }}
                              >
                                <Input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="h-7.5 text-[12px]"
                                  autoFocus
                                />
                                <button
                                  type="submit"
                                  className="rounded-md p-1 text-good-ink hover:bg-surface-2"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="rounded-md p-1 text-ink-3 hover:bg-surface-2"
                                >
                                  <X size={14} />
                                </button>
                              </form>
                            ) : (
                              <>
                                <span className="truncate font-medium text-ink flex-1">
                                  {label(sub)}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(sub._id);
                                      setEditName(label(sub));
                                    }}
                                    className="p-1 text-ink-3 hover:text-ink rounded-md hover:bg-surface-2"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleting(sub)}
                                    className="p-1 text-ink-3 hover:text-critical rounded-md hover:bg-surface-2"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {addingSubFor === c._id && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void addSubCategory(c._id);
                        }}
                        className="flex items-center gap-2 pl-4 mt-1"
                      >
                        <Input
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          placeholder="Sub-category name (e.g. Oyster)"
                          className="h-8 text-[12.5px]"
                          autoFocus
                        />
                        <Button size="sm" variant="primary" type="submit" className="h-8 px-3 text-[12px]">
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => setAddingSubFor(null)}
                          className="h-8 px-2 text-[12px]"
                        >
                          Cancel
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={addCategory} className="flex items-center gap-2 pt-2 border-t border-line">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add new main category (e.g. Fresh Mushroom)…"
            className="h-10 text-[13.5px]"
          />
          <Button type="submit" variant="primary" className="shrink-0 h-10 gap-1 px-4 font-semibold">
            <Plus size={16} />
            {t("common.add")}
          </Button>
        </form>
      </div>

      <PasscodeConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={deleting?.parentId ? "Delete sub-category?" : "Delete category?"}
        body={
          deleting?.parentId
            ? `Are you sure you want to delete "${label(deleting)}"? Products with this sub-category will remain in the parent category.`
            : `Are you sure you want to delete "${deleting ? label(deleting) : ""}"? Its sub-categories will be removed and products will become uncategorized.`
        }
        confirmLabel={t("common.delete")}
      />
    </Modal>
  );
}
