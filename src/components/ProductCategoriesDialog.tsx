import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  const [deltaY, setDeltaY] = useState<number>(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [subOrders, setSubOrders] = useState<Record<string, Id<"productCategories">[]>>({});

  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  const dragIdRef = useRef<string | null>(null);
  dragIdRef.current = dragId;
  const hoverIndexRef = useRef<number | null>(null);
  hoverIndexRef.current = hoverIndex;
  const dragStartY = useRef<number>(0);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const rowPositions = useRef<Array<{ id: string; top: number; height: number; midY: number }>>([]);

  const rows = order
    ? order
        .map((id) => categories.find((c) => c._id === id))
        .filter((c): c is Doc<"productCategories"> => Boolean(c))
    : categories;

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

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

  function initDrag(id: string, startClientY: number) {
    dragStartY.current = startClientY;
    dragIdRef.current = id;
    setDragId(id);
    setDeltaY(0);

    const currentRows = rowsRef.current;
    const startIdx = currentRows.findIndex((c) => c._id === id);
    const initialIdx = startIdx >= 0 ? startIdx : 0;
    hoverIndexRef.current = initialIdx;
    setHoverIndex(initialIdx);

    // Measure bounding boxes of all items at the rest position
    const pos: Array<{ id: string; top: number; height: number; midY: number }> = [];
    currentRows.forEach((c) => {
      const el = rowRefs.current.get(c._id);
      if (el) {
        const rect = el.getBoundingClientRect();
        pos.push({
          id: c._id,
          top: rect.top,
          height: rect.height,
          midY: rect.top + rect.height / 2,
        });
      }
    });
    rowPositions.current = pos;
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
      initDrag(id, startY);
      navigator.vibrate?.([25]);
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
    initDrag(id, e.clientY);
    navigator.vibrate?.([20]);
  }

  // Global window listeners while actively dragging for 100% fluid pointer tracking
  useEffect(() => {
    if (!dragId) return;

    function handlePointerMove(e: PointerEvent) {
      const activeId = dragIdRef.current;
      if (!activeId) return;

      const dy = e.clientY - dragStartY.current;
      setDeltaY(dy);

      const pos = rowPositions.current;
      const currentRows = rowsRef.current;
      const startIdx = currentRows.findIndex((c) => c._id === activeId);
      if (startIdx === -1 || pos.length === 0) return;

      const draggedPos = pos.find((p) => p.id === activeId);
      const draggedCenter = (draggedPos ? draggedPos.midY : e.clientY) + dy;

      let targetIdx = startIdx;

      // Moving down
      for (let i = startIdx + 1; i < pos.length; i++) {
        if (draggedCenter > pos[i].midY + 6) {
          targetIdx = i;
        } else {
          break;
        }
      }

      // Moving up
      for (let i = startIdx - 1; i >= 0; i--) {
        if (draggedCenter < pos[i].midY - 6) {
          targetIdx = i;
        } else {
          break;
        }
      }

      if (hoverIndexRef.current !== targetIdx) {
        hoverIndexRef.current = targetIdx;
        setHoverIndex(targetIdx);
        navigator.vibrate?.([10]);
      }
    }

    async function handlePointerUp() {
      cancelPress();
      const activeId = dragIdRef.current;
      const targetIdx = hoverIndexRef.current;

      setDragId(null);
      setHoverIndex(null);
      setDeltaY(0);

      if (!activeId || targetIdx === null) return;

      const currentRows = rowsRef.current;
      const startIdx = currentRows.findIndex((c) => c._id === activeId);
      if (startIdx === -1 || startIdx === targetIdx) return;

      const next = [...currentRows];
      const [removed] = next.splice(startIdx, 1);
      next.splice(targetIdx, 0, removed);
      const nextIds = next.map((c) => c._id);

      setOrder(nextIds);
      navigator.vibrate?.([15]);

      try {
        await reorder({ ids: nextIds });
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

  function getItemStyle(cId: string, index: number): CSSProperties | undefined {
    if (dragId === cId) {
      return {
        transform: `translateY(${deltaY}px) scale(1.045)`,
        zIndex: 50,
        position: "relative",
      };
    }

    if (!dragId || hoverIndex === null) {
      return undefined;
    }

    const currentRows = rowsRef.current;
    const startIndex = currentRows.findIndex((c) => c._id === dragId);
    if (startIndex === -1) return undefined;

    const draggedPos = rowPositions.current.find((p) => p.id === dragId);
    const shiftDistance = (draggedPos?.height ?? 60) + 12; // 12px = gap-3

    let translateY = 0;
    if (startIndex < hoverIndex) {
      // Dragged item is moving DOWN
      if (index > startIndex && index <= hoverIndex) {
        translateY = -shiftDistance;
      }
    } else if (startIndex > hoverIndex) {
      // Dragged item is moving UP
      if (index >= hoverIndex && index < startIndex) {
        translateY = shiftDistance;
      }
    }

    return {
      transform: translateY !== 0 ? `translateY(${translateY}px)` : undefined,
      transition: "transform 220ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease",
      zIndex: 1,
    };
  }

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
          {rows.map((c, cIdx) => {
            const subcats = getSubcategories(c._id);
            const hasSubcats = subcats.length > 0;
            const isExpanded = expanded[c._id] ?? true;
            const isSubSectionOpen = (hasSubcats && isExpanded) || addingSubFor === c._id;
            const isHeld = pressId === c._id && !dragId;
            const isDragging = dragId === c._id;
            const isOther = Boolean(dragId && !isDragging);

            return (
              <li
                key={c._id}
                ref={(el) => {
                  if (el) rowRefs.current.set(c._id, el);
                  else rowRefs.current.delete(c._id);
                }}
                style={getItemStyle(c._id, cIdx)}
                onPointerDown={(e) => startPress(e, c._id)}
                onPointerMove={handlePointerMoveOnRow}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => {
                  if (pressId || dragId) e.preventDefault();
                }}
                className={cx(
                  "flex flex-col rounded-2xl border select-none [-webkit-touch-callout:none]",
                  !isHeld && !isDragging && "bg-page border-line shadow-xs",
                  isHeld && "scale-[1.035] border-emerald-500 bg-emerald-500/[0.08] ring-4 ring-emerald-500/25 shadow-[0_12px_28px_-4px_rgba(16,185,129,0.35)] transition-all duration-300 ease-out",
                  isDragging && "cursor-grabbing border-emerald-500 bg-page ring-4 ring-emerald-500/40 shadow-[0_20px_45px_-8px_rgba(16,185,129,0.45),0_0_0_1px_rgba(16,185,129,0.4)]",
                  isOther && "opacity-60",
                )}
              >
                {/* Main Category Header Row */}
                <div
                  className={cx(
                    "flex items-center justify-between gap-2 px-3.5 py-3 transition-colors duration-200",
                    isHeld && "bg-emerald-500/15",
                    isDragging && "bg-emerald-500/20",
                    !isHeld && !isDragging && "bg-surface/50",
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
                            "shrink-0 touch-none rounded-lg p-1 transition-all",
                            isDragging || isHeld
                              ? "cursor-grabbing text-emerald-500 bg-emerald-500/10 scale-110"
                              : "cursor-grab text-ink-3/60 hover:text-ink hover:bg-surface-2",
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

                        <span
                          className={cx(
                            "truncate text-[14px] font-bold transition-colors",
                            (isHeld || isDragging) ? "text-emerald-950 dark:text-emerald-100 font-extrabold" : "text-ink"
                          )}
                        >
                          {label(c)}
                        </span>
                        <span
                          className={cx(
                            "shrink-0 text-[11px] font-semibold tabular-nums transition-colors",
                            (isHeld || isDragging) ? "text-emerald-700 dark:text-emerald-300 font-bold" : "text-ink-3"
                          )}
                        >
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
