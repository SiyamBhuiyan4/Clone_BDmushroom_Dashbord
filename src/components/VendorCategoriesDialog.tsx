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
const HOLD_MS = 300;
/** How long rows take to slide out of the way, and the dropped row to settle. */
const SETTLE_MS = 220;

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
    Press and hold a row to pick it up, then drag it to reorder.

    Holding grows the row and turns it green; after HOLD_MS it lifts and
    follows the pointer exactly, while the rows it passes slide out of its
    way. Letting go glides it into its slot and saves the new order. Letting
    go early, or moving off first (a scroll), does nothing. The DOM order
    never changes mid-drag — rows only move by transform, which is what
    keeps it smooth — and is committed once the drop has settled.
  */
  type Drag = { id: string; from: number; to: number; dy: number; step: number; startY: number };
  const [order, setOrder] = useState<Id<"vendorCategories">[] | null>(null);
  const [pressId, setPressId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [settling, setSettling] = useState(false);
  /** One frame with transitions off, while the new order is committed in place. */
  const [frozen, setFrozen] = useState(false);
  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const rows = order
    ? order.map((id) => categories.find((c) => c._id === id)).filter((c): c is Doc<"vendorCategories"> => Boolean(c))
    : categories;

  // Once a row is picked up, a finger moving it must not scroll the page too.
  useEffect(() => {
    const stopScroll = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
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
    if (drag || settling) return;
    // So the moves keep coming to this row even once the pointer leaves it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks; the hold still works without it.
    }
    const timer = window.setTimeout(() => {
      const press = pressRef.current;
      pressRef.current = null;
      setPressId(null);
      if (!press) return;
      const tops = rows.map((r) => rowRefs.current.get(r._id)?.getBoundingClientRect().top ?? 0);
      const from = rows.findIndex((r) => r._id === id);
      const height = rowRefs.current.get(id)?.getBoundingClientRect().height ?? 56;
      // The distance from one row to the next, gap included.
      const step = tops.length > 1 ? tops[1] - tops[0] : height;
      setDrag({ id, from, to: from, dy: 0, step, startY: press.y });
      navigator.vibrate?.(12);
    }, HOLD_MS);
    pressRef.current = { id, x: e.clientX, y: e.clientY, timer };
    setPressId(id);
  }

  function moveDrag(e: React.PointerEvent) {
    const press = pressRef.current;
    // Moving off before it's picked up means this was a scroll, not a hold.
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
    const d = dragRef.current;
    if (!d || settling) return;
    const dy = e.clientY - d.startY;
    const to = Math.max(0, Math.min(rows.length - 1, Math.round(d.from + dy / d.step)));
    setDrag({ ...d, dy, to });
  }

  function endDrag() {
    cancelPress();
    const d = dragRef.current;
    if (!d || settling) return;
    const ids = rows.map((r) => r._id);
    const final = [...ids];
    final.splice(d.from, 1);
    final.splice(d.to, 0, d.id as Id<"vendorCategories">);
    // Glide into the slot, then commit the order with nothing animating.
    setSettling(true);
    window.setTimeout(() => {
      setFrozen(true);
      setOrder(final);
      setDrag(null);
      setSettling(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setFrozen(false)));
      if (d.to === d.from) {
        setOrder(null);
        return;
      }
      reorder({ ids: final })
        .catch((err) => toast.error(errorMessage(err)))
        .finally(() => setOrder(null));
    }, SETTLE_MS);
  }

  /** Where a row sits right now, relative to its place in the list. */
  function offsetOf(index: number, id: string) {
    if (!drag) return 0;
    if (id === drag.id) return settling ? (drag.to - drag.from) * drag.step : drag.dy;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.step;
    return 0;
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
          {rows.map((c, index) => {
            // Back to its own colours while it glides into place, so nothing jumps on commit.
            const lifted = pressId === c._id || (drag?.id === c._id && !settling);
            const following = drag?.id === c._id && !settling;
            return (
            <li
              key={c._id}
              ref={(el) => {
                if (el) rowRefs.current.set(c._id, el);
                else rowRefs.current.delete(c._id);
              }}
              onPointerDown={(e) => startPress(e, c._id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onContextMenu={(e) => {
                if (pressId || drag) e.preventDefault();
              }}
              style={{
                translate: `0 ${offsetOf(index, c._id)}px`,
                transitionProperty: "translate, scale, background-color, border-color, box-shadow",
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                // The row under the pointer follows it exactly; everything else eases.
                transitionDuration: frozen
                  ? "0ms"
                  : following
                    ? `0ms, ${HOLD_MS}ms, ${HOLD_MS}ms, ${HOLD_MS}ms, ${HOLD_MS}ms`
                    : pressId === c._id
                      ? `0ms, ${HOLD_MS}ms, ${HOLD_MS}ms, ${HOLD_MS}ms, ${HOLD_MS}ms`
                      : `${SETTLE_MS}ms`,
              }}
              className={cx(
                "relative flex items-center gap-2 rounded-xl border px-3.5 py-2.5 select-none [-webkit-touch-callout:none]",
                lifted
                  ? "z-10 scale-[1.04] border-accent bg-accent shadow-[var(--shadow-pop)]"
                  : "border-line bg-page",
                drag?.id === c._id && "cursor-grabbing",
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
                    <p
                      className={cx(
                        "truncate text-[13.5px] font-semibold transition-colors",
                        lifted ? "text-white" : "text-ink",
                      )}
                      style={{ transitionDuration: `${HOLD_MS}ms` }}
                    >
                      {label(c)}
                    </p>
                    <p
                      className={cx("text-[11.5px] transition-colors", lifted ? "text-white/80" : "text-ink-3")}
                      style={{ transitionDuration: `${HOLD_MS}ms` }}
                    >
                      {plural(countIn(c._id), "vendor")}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingId(c._id);
                      setEditName(label(c));
                    }}
                    aria-label={`${t("common.edit")} ${label(c)}`}
                    className={cx("rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors", lifted && "text-white/80")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleting(c)}
                    aria-label={`${t("common.delete")} ${label(c)}`}
                    className={cx("rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical transition-colors", lifted && "text-white/80")}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
            );
          })}
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
