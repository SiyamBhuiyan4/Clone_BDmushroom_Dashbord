import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react";
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
 * Vendor categories and sub-categories management.
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
  const { categories, subcategoriesOf, label } = useVendorCategories();
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
    A grip handle is also available for instant grab-and-drag.
  */
  const [order, setOrder] = useState<Id<"vendorCategories">[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pressId, setPressId] = useState<string | null>(null);
  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  const dragIdRef = useRef<string | null>(null);
  dragIdRef.current = dragId;
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const rows = order
    ? order
        .map((id) => categories.find((c) => c._id === id))
        .filter((c): c is Doc<"vendorCategories"> => Boolean(c))
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
    if ((e.target as Element).closest("button, input, form")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
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

  function startDrag(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    cancelPress();
    setDragId(id);
    setOrder(categories.map((c) => c._id));
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
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
    const next = orderAt(e.clientY);
    if (next && order && next.some((id, i) => id !== order[i])) setOrder(next);
  }

  async function endDrag(e: React.PointerEvent) {
    cancelPress();
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

  async function moveSubCategory(
    subId: Id<"vendorCategories">,
    direction: "up" | "down",
    parentId: Id<"vendorCategories">,
  ) {
    const currentSubs = subcategoriesOf(parentId);
    const idx = currentSubs.findIndex((s) => s._id === subId);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentSubs.length) return;
    const newSubs = [...currentSubs];
    const [removed] = newSubs.splice(idx, 1);
    newSubs.splice(targetIdx, 0, removed);
    try {
      await reorder({ ids: newSubs.map((s) => s._id) });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<Doc<"vendorCategories"> | null>(null);

  // Sub-category state
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const countIn = (categoryId: string) =>
    vendors.filter((v) => v.categoryId === categoryId || v.subCategoryId === categoryId).length;

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

  async function addSubCategory(parentId: Id<"vendorCategories">) {
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

  async function saveRename(id: Id<"vendorCategories">) {
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
    await remove({ id: deleting._id, passcode });
    onDeleted?.(deleting._id);
    toast.ok("Category removed.");
    setDeleting(null);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Tags size={19} />}
      title={t("vendors.categoriesTitle")}
      subtitle={t("vendors.categoriesSubtitle")}
      width="sm:max-w-xl"
    >
      <div className="flex flex-col gap-4 px-6 py-6 max-h-[75vh] overflow-y-auto">
        <ul className="flex flex-col gap-3">
          {rows.map((c) => {
            const subcats = subcategoriesOf(c._id);
            const hasSubcats = subcats.length > 0;
            const isExpanded = expanded[c._id] ?? true;
            const isSubSectionOpen = (hasSubcats && isExpanded) || addingSubFor === c._id;
            return (
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
                  "flex flex-col rounded-2xl border bg-page overflow-hidden select-none [-webkit-touch-callout:none]",
                  "transition-[scale,box-shadow,border-color]",
                  dragId === c._id
                    ? "relative z-20 scale-[1.03] cursor-grabbing border-accent shadow-[var(--shadow-pop)] duration-200"
                    : pressId === c._id
                      ? "scale-[1.03] border-accent/60 shadow-[var(--shadow-pop)] duration-[1600ms] ease-linear"
                      : "border-line shadow-xs duration-200",
                )}
              >
                {/* Main Category Header Row */}
                <div
                  className={cx(
                    "flex items-center justify-between gap-2 px-3.5 py-3 bg-surface/50",
                    isSubSectionOpen && "border-b border-line/60"
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
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {/* Grip Handle for instant drag */}
                        <button
                          type="button"
                          onPointerDown={(e) => startDrag(e, c._id)}
                          onPointerMove={moveDrag}
                          onPointerUp={(e) => void endDrag(e)}
                          onPointerCancel={(e) => void endDrag(e)}
                          aria-label={`Drag to reorder ${label(c)}`}
                          title="Drag or press and hold to reorder"
                          className={cx(
                            "shrink-0 touch-none rounded-lg p-1 text-ink-3/60 hover:text-ink hover:bg-surface-2 transition-colors",
                            dragId === c._id ? "cursor-grabbing text-accent" : "cursor-grab",
                          )}
                        >
                          <GripVertical size={15} />
                        </button>

                        {/* Expand / Collapse Chevron */}
                        {hasSubcats ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(c._id)}
                            aria-label={isExpanded ? "Collapse sub-categories" : "Expand sub-categories"}
                            className="p-1 rounded-md text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
                          >
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        ) : (
                          <span className="w-6 shrink-0" aria-hidden />
                        )}

                        <span className="truncate text-[14px] font-bold text-ink">
                          {label(c)}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-ink-3 tabular-nums">
                          ({plural(countIn(c._id), "vendor")})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
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
                          {t("vendors.addSubCategory")}
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
                {isSubSectionOpen && (
                  <div className="px-4 py-2.5 flex flex-col gap-1.5 bg-page">
                    {hasSubcats && isExpanded && (
                      <ul className="flex flex-col gap-1 pl-4">
                        {subcats.map((sub, sIdx) => (
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
                                  aria-label={t("common.done")}
                                  className="rounded-md p-1 text-good-ink hover:bg-surface-2"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  aria-label={t("common.cancel")}
                                  className="rounded-md p-1 text-ink-3 hover:bg-surface-2"
                                >
                                  <X size={14} />
                                </button>
                              </form>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  {subcats.length > 1 && (
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        disabled={sIdx === 0}
                                        onClick={() => void moveSubCategory(sub._id, "up", c._id)}
                                        aria-label="Move subcategory up"
                                        title="Move up"
                                        className="p-1 rounded text-ink-3/60 hover:text-ink hover:bg-surface-2 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                                      >
                                        <ArrowUp size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={sIdx === subcats.length - 1}
                                        onClick={() => void moveSubCategory(sub._id, "down", c._id)}
                                        aria-label="Move subcategory down"
                                        title="Move down"
                                        className="p-1 rounded text-ink-3/60 hover:text-ink hover:bg-surface-2 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                                      >
                                        <ArrowDown size={12} />
                                      </button>
                                    </div>
                                  )}
                                  <span className="truncate font-medium text-ink flex-1">
                                    {label(sub)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(sub._id);
                                      setEditName(label(sub));
                                    }}
                                    aria-label={t("common.edit")}
                                    className="p-1 text-ink-3 hover:text-ink rounded-md hover:bg-surface-2"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleting(sub)}
                                    aria-label={t("common.delete")}
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
                          placeholder="Sub-category name…"
                          className="h-8 text-[12.5px]"
                          autoFocus
                        />
                        <Button size="sm" variant="primary" type="submit" className="h-8 px-3 text-[12px]">
                          {t("common.add")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => setAddingSubFor(null)}
                          className="h-8 px-2 text-[12px]"
                        >
                          {t("common.cancel")}
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
            placeholder="Add new main vendor category…"
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
            ? `Are you sure you want to delete "${label(deleting)}"? Vendors with this sub-category will remain in the parent category.`
            : `Are you sure you want to delete "${deleting ? label(deleting) : ""}"? Its sub-categories will be removed and vendors will become uncategorized.`
        }
        confirmLabel={t("common.delete")}
      />
    </Modal>
  );
}
