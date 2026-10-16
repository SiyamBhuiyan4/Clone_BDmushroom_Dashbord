import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button, Input, Modal, cx } from "./ui";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { useT } from "../lib/i18n";
import { plural } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { useVendorCategories } from "../lib/vendorCategories";

/** How long a row has to be held before it can be dragged. */
const HOLD_MS = 1600;

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
  const { categories, label, categoryOf } = useVendorCategories();
  const vendors = useAuthedQuery(api.vendors.list, {}) ?? [];
  const create = useAuthedMutation(api.vendorCategories.create);
  const rename = useAuthedMutation(api.vendorCategories.rename);
  const remove = useAuthedMutation(api.vendorCategories.remove);
  const reorder = useAuthedMutation(api.vendorCategories.reorder);

  /*
    Press and hold a row to pick it up, then drag it to reorder. The row
    grows slowly while held, so it's clear something is about to happen;
    once picked up, rows swap as the pointer passes their middle, and
    letting go saves the new order. Letting go early, or moving off before
    it's picked up (scrolling the list, say), does nothing. Pointer events
    rather than HTML drag-and-drop, so it works the same by touch.
  */
  const [order, setOrder] = useState<Id<"vendorCategories">[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pressId, setPressId] = useState<string | null>(null);
  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  const dragIdRef = useRef<string | null>(null);
  dragIdRef.current = dragId;
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const rows = order
    ? order.map((id) => categories.find((c) => c._id === id)).filter((c): c is Doc<"vendorCategories"> => Boolean(c))
    : categories;

  // Once a row is picked up, a finger moving it must not scroll the page too.
  useEffect(() => {
    const stopScroll = (e: TouchEvent) => {
      if (dragIdRef.current) e.preventDefault();
    };
    document.addEventListener("touchmove", stopScroll, { passive: false });
    return () => document.removeEventListener("touchmove", stopScroll);
  }, []);

  function cancelPress() {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
    setPressId(null);
  }

  function startPress(e: React.PointerEvent<HTMLLIElement>, id: string) {
    // The row's own buttons and the rename field keep working as before.
    if ((e.target as Element).closest("button, input, form")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // So the moves keep coming to this row even once the pointer leaves it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks; the hold still works without it.
    }
    const timer = window.setTimeout(() => {
      pressRef.current = null;
      setPressId(null);
      setDragId(id);
      setOrder(categories.map((c) => c._id));
      navigator.vibrate?.(12);
    }, HOLD_MS);
    pressRef.current = { id, x: e.clientX, y: e.clientY, timer };
    setPressId(id);
  }

  /** The order with the dragged row placed where the pointer is now. */
  function orderAt(clientY: number) {
    if (!dragId || !order) return null;
    const others = order.filter((id) => id !== dragId);
    // How many of the other rows sit above the pointer is where this one goes.
    const index = others.filter((id) => {
      const rect = rowRefs.current.get(id)?.getBoundingClientRect();
      return rect ? rect.top + rect.height / 2 < clientY : false;
    }).length;
    return [...others.slice(0, index), dragId as Id<"vendorCategories">, ...others.slice(index)];
  }

  function moveDrag(e: React.PointerEvent) {
    const press = pressRef.current;
    // Moving off before it's picked up means this was a scroll, not a hold.
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
    const next = orderAt(e.clientY);
    if (next && order && next.some((id, i) => id !== order[i])) setOrder(next);
  }

  async function endDrag(e: React.PointerEvent) {
    cancelPress();
    // Where it was let go counts, even if no move event landed there first.
    const final = orderAt(e.clientY) ?? order;
    if (!dragId || !final) return;
    setDragId(null);
    setOrder(final);
    const changed = final.some((id, i) => id !== categories[i]?._id);
    try {
      if (changed) await reorder({ ids: final });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOrder(null);
    }
  }

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
          {rows.map((c) => (
            <li
              key={c._id}
              ref={(el) => {
                if (el) rowRefs.current.set(c._id, el);
                else rowRefs.current.delete(c._id);
              }}
              onPointerDown={(e) => startPress(e, c._id)}
              onPointerMove={moveDrag}
              onPointerUp={(e) => void endDrag(e)}
              onPointerCancel={(e) => void endDrag(e)}
              onContextMenu={(e) => {
                if (pressId || dragId) e.preventDefault();
              }}
              className={cx(
                "flex items-center gap-2 rounded-xl border bg-page px-3.5 py-2.5 select-none [-webkit-touch-callout:none]",
                "transition-[scale,box-shadow,border-color]",
                dragId === c._id
                  ? "relative z-10 scale-[1.04] cursor-grabbing border-accent shadow-[var(--shadow-pop)] duration-200"
                  : pressId === c._id
                    ? // Grows for as long as the hold takes, so it lifts right as it's picked up.
                      "scale-[1.04] border-accent/60 shadow-[var(--shadow-pop)] duration-[1600ms] ease-linear"
                    : "border-line duration-200",
              )}
            >
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
                    <p className="text-[11.5px] text-ink-3">{plural(countIn(c._id), "vendor")}</p>
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
            ? `${label(deleting)} · ${plural(countIn(deleting._id), "vendor")}\n${t("vendors.deleteCategoryBody")}`
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
