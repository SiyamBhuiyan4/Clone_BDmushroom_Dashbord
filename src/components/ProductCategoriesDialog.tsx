import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  Pencil,
  Plus,
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
import { useProductCategories } from "../lib/productCategories";

/** How long a row has to be held before it can be dragged (0.3s). */
const HOLD_MS = 300;

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
  const reorder = useAuthedMutation(api.productCategories.reorder);

  const [order, setOrder] = useState<Id<"productCategories">[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pressId, setPressId] = useState<string | null>(null);
  const [subOrders, setSubOrders] = useState<Record<string, Id<"productCategories">[]>>({});

  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  const dragIdRef = useRef<string | null>(null);
  dragIdRef.current = dragId;
  const orderRef = useRef(order);
  orderRef.current = order;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const rows = order
    ? order
        .map((id) => categories.find((c) => c._id === id))
        .filter((c): c is Doc<"productCategories"> => Boolean(c))
    : categories;

  const getSubcategories = (parentId: Id<"productCategories">) => {
    const subs = subcategoriesOf(parentId);
    const customOrder = subOrders[parentId];
    if (!customOrder) return subs;
    return customOrder
      .map((id) => subs.find((s) => s._id === id))
      .filter((s): s is Doc<"productCategories"> => Boolean(s));
  };

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
    if ((e.target as Element).closest("button, input, form, [data-nodrag]")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    cancelPress();
    setPressId(id);
    const startX = e.clientX;
    const startY = e.clientY;

    const timer = window.setTimeout(() => {
      pressRef.current = null;
      setPressId(null);
      setDragId(id);
      setOrder(categoriesRef.current.map((c) => c._id));
      navigator.vibrate?.([20]);
    }, HOLD_MS);

    pressRef.current = { id, x: startX, y: startY, timer };
  }

  function handlePointerMoveOnRow(e: React.PointerEvent) {
    const press = pressRef.current;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) {
      cancelPress();
    }
  }

  function startDrag(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    cancelPress();
    setDragId(id);
    setOrder(categories.map((c) => c._id));
    navigator.vibrate?.([15]);
  }

  /**
   * Calculates the reordered list using hysteresis deadzones (0.45 and 0.55).
   * This completely prevents rapid bouncing/jittering when crossing row midpoints.
   */
  function orderAt(clientY: number): Id<"productCategories">[] | null {
    const activeOrder = orderRef.current;
    const activeDragId = dragIdRef.current;
    if (!activeDragId || !activeOrder) return null;

    const currIdx = activeOrder.indexOf(activeDragId as Id<"productCategories">);
    if (currIdx === -1) return null;

    let targetIdx = currIdx;

    // Moving UP: check items above
    for (let i = currIdx - 1; i >= 0; i--) {
      const id = activeOrder[i];
      const rect = rowRefs.current.get(id)?.getBoundingClientRect();
      if (!rect) break;
      const threshold = rect.top + rect.height * 0.45;
      if (clientY < threshold) {
        targetIdx = i;
      } else {
        break;
      }
    }

    // Moving DOWN: check items below
    for (let i = currIdx + 1; i < activeOrder.length; i++) {
      const id = activeOrder[i];
      const rect = rowRefs.current.get(id)?.getBoundingClientRect();
      if (!rect) break;
      const threshold = rect.top + rect.height * 0.55;
      if (clientY > threshold) {
        targetIdx = i;
      } else {
        break;
      }
    }

    if (targetIdx === currIdx) return activeOrder;

    const next = [...activeOrder];
    const [item] = next.splice(currIdx, 1);
    next.splice(targetIdx, 0, item);
    return next;
  }

  // Global window listeners while actively dragging for 100% fluid pointer tracking
  useEffect(() => {
    if (!dragId) return;

    function handlePointerMove(e: PointerEvent) {
      const next = orderAt(e.clientY);
      if (next && orderRef.current && next.some((id, i) => id !== orderRef.current![i])) {
        navigator.vibrate?.([10]);
        setOrder(next);
      }
    }

    async function handlePointerUp(e: PointerEvent) {
      cancelPress();
      const final = orderAt(e.clientY) ?? orderRef.current;
      const activeId = dragIdRef.current;
      setDragId(null);
      if (!activeId || !final) return;
      setOrder(final);
      const changed = final.some((id, i) => id !== categoriesRef.current[i]?._id);
      try {
        if (changed) await reorder({ ids: final });
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setOrder(null);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragId]);

  async function moveSubCategory(
    subId: Id<"productCategories">,
    direction: "up" | "down",
    parentId: Id<"productCategories">,
  ) {
    const currentSubs = getSubcategories(parentId);
    const idx = currentSubs.findIndex((s) => s._id === subId);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentSubs.length) return;

    const newSubs = [...currentSubs];
    const [removed] = newSubs.splice(idx, 1);
    newSubs.splice(targetIdx, 0, removed);
    const newIds = newSubs.map((s) => s._id);

    setSubOrders((prev) => ({ ...prev, [parentId]: newIds }));
    navigator.vibrate?.([10]);

    try {
      await reorder({ ids: newIds });
    } catch (err) {
      toast.error(errorMessage(err));
      setSubOrders((prev) => {
        const copy = { ...prev };
        delete copy[parentId];
        return copy;
      });
    }
  }

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
    await remove({ id: deleting._id, passcode });
    onDeleted?.(deleting._id);
    toast.ok("Category removed.");
    setDeleting(null);
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
          {rows.map((c) => {
            const subcats = getSubcategories(c._id);
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
                onPointerMove={handlePointerMoveOnRow}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => {
                  if (pressId || dragId) e.preventDefault();
                }}
                className={cx(
                  "flex flex-col rounded-2xl border bg-page select-none [-webkit-touch-callout:none]",
                  "transition-[transform,scale,box-shadow,border-color,background-color,opacity] duration-200 ease-out",
                  dragId === c._id
                    ? "relative z-30 scale-[1.025] cursor-grabbing border-accent shadow-xl shadow-accent/20 ring-2 ring-accent/35 bg-surface"
                    : pressId === c._id
                      ? "relative z-20 scale-[1.018] border-accent/80 shadow-md shadow-accent/15 bg-surface/80 duration-300 ease-out"
                      : "border-line shadow-xs duration-200",
                  dragId && dragId !== c._id ? "opacity-75" : "opacity-100",
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
                          aria-label={`Drag to reorder ${label(c)}`}
                          title="Drag or hold for 0.3s to reorder"
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
                          ({plural(countIn(c._id), "product")})
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
                {isSubSectionOpen && (
                  <div
                    data-nodrag="true"
                    onPointerDown={(e) => e.stopPropagation()}
                    className="px-4 py-2.5 flex flex-col gap-1.5 bg-page"
                  >
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
                          placeholder="Sub-category name (e.g. Oyster)"
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
