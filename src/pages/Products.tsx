import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  Archive,
  Layers,
  Minus,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Select, cx } from "../components/ui";
import { Pagination, SortSelect, usePagination } from "../components/Pagination";
import { useT } from "../lib/i18n";
import { ProductDialog } from "../components/ProductDialog";
import { ProductDetailDialog } from "../components/ProductDetailDialog";
import { SaleDialog } from "../components/SaleDialog";
import { BatchDialog } from "../components/BatchDialog";
import { PasscodeConfirmDialog } from "../components/PasscodeConfirmDialog";
import { useSettings } from "../lib/settings";
import { gradientFor, initialOf } from "../lib/avatar";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedQuery, useAuthedMutation } from "../lib/session";

type SortKey = "newest" | "name" | "stockLow" | "stockHigh" | "costHigh";

export function ProductsPage() {
  const { fmt, fmtNum } = useSettings();
  const t = useT();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [showArchived, setShowArchived] = useState(false);

  const products = useAuthedQuery(api.products.list, { search, includeArchived: showArchived });
  const categories = useAuthedQuery(api.products.categories) ?? [];

  const restock = useAuthedMutation(api.products.restock);
  /*
    Lots with stock left, so a card can say what this product actually cost —
    which is a range once it has been bought twice at two prices, not the one
    figure on the product.
  */
  const openLots = useAuthedQuery(api.profit.openLots) ?? [];
  const setArchived = useAuthedMutation(api.products.setArchived);
  const remove = useAuthedMutation(api.products.remove);

  const [editing, setEditing] = useState<Doc<"products"> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selling, setSelling] = useState<Doc<"products"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"products"> | null>(null);
  const [viewing, setViewing] = useState<Doc<"products"> | null>(null);
  const [lotFor, setLotFor] = useState<Doc<"products"> | null>(null);

  const visible = useMemo(() => {
    const filtered = (products ?? []).filter((p) => !category || p.category === category);
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stockLow") return a.quantity - b.quantity;
      if (sort === "stockHigh") return b.quantity - a.quantity;
      if (sort === "costHigh") return b.costPrice - a.costPrice;
      return b.createdAt - a.createdAt;
    });
  }, [products, category, sort]);

  const pager = usePagination(visible, `${search}|${category}|${sort}|${showArchived}`, 25);

  async function adjust(product: Doc<"products">, delta: number) {
    try {
      await restock({ id: product._id, delta });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {t("products.title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3 sm:text-[14px]">{t("products.subtitle")}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setAddOpen(true)}
          className="w-full sm:w-auto"
        >
          <PackagePlus size={17} />
          {t("dash.addProduct")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 sm:min-w-60 sm:max-w-md sm:flex-1">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("products.searchPlaceholder")}
            className="pl-10.5"
            aria-label={t("common.search")}
          />
        </div>
        <div className="flex w-full gap-3 sm:w-auto">
          <div className="flex-1 sm:w-48 sm:flex-none">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label={t("common.category")}
            >
              <option value="">{t("common.allCategories")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1 sm:flex-none">
            <SortSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: "newest", label: t("products.sortNewest") },
                { value: "name", label: t("products.sortName") },
                { value: "stockLow", label: t("products.sortStockLow") },
                { value: "stockHigh", label: t("products.sortStockHigh") },
                { value: "costHigh", label: t("products.sortCostHigh") },
              ]}
            />
          </div>
        </div>
        <label className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-line-strong bg-page px-3.5 text-[13.5px] font-medium text-ink-2 sm:w-auto">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          {t("products.showArchived")}
        </label>
      </div>

      {products === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="ac-skeleton h-60 rounded-card border border-line bg-surface" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package size={24} />}
            title={search || category ? "No matches" : "No products yet"}
            body={
              search || category
                ? "Try a different search term or clear the category filter."
                : "Add a product with a name, a cost price and however many units you have."
            }
            action={
              !search && !category ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <PackagePlus size={17} />
                  Add product
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <p className="-mt-1 text-[13px] font-medium text-ink-3">
            {fmtNum(visible.length)} · {fmtNum(visible.reduce((sum, p) => sum + p.quantity, 0))}{" "}
            {t("common.units")} {t("products.inStock")}
          </p>
          <div className="ac-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pager.pageRows.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                lots={openLots.filter((l) => l.productId === product._id)}
                onAddLot={() => setLotFor(product)}
                onView={() => setViewing(product)}
                onSell={() => setSelling(product)}
                onEdit={() => setEditing(product)}
                onDelete={() => setDeleting(product)}
                onArchiveToggle={async () => {
                  await setArchived({ id: product._id, archived: !product.archived });
                  toast.ok(
                    product.archived ? `${product.name} restored.` : `${product.name} archived.`,
                  );
                }}
                onAdjust={(delta) => adjust(product, delta)}
                fmt={fmt}
              />
            ))}
          </div>
          {pager.pageCount > 1 && (
            <Card>
              <Pagination
                page={pager.page}
                pageCount={pager.pageCount}
                pageSize={pager.pageSize}
                total={pager.total}
                onPage={pager.setPage}
                onPageSize={pager.setPageSize}
                itemLabel="products"
              />
            </Card>
          )}
        </>
      )}

      <ProductDetailDialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        productId={viewing?._id ?? null}
      />
      <BatchDialog
        open={lotFor !== null}
        onClose={() => setLotFor(null)}
        presetProductId={lotFor?._id}
      />
      <ProductDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ProductDialog open={editing !== null} onClose={() => setEditing(null)} product={editing} />
      <SaleDialog
        open={selling !== null}
        onClose={() => setSelling(null)}
        presetProduct={selling}
      />
      <PasscodeConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("confirm.deleteProduct")}
        body={
          deleting ? `${deleting.name}\n${t("confirm.deleteProductBody")}` : ""
        }
        onConfirm={async (passcode) => {
          if (!deleting) return;
          await remove({ id: deleting._id, passcode });
          toast.ok(t("toast.productDeleted"));
        }}
      />
    </div>
  );
}

function ProductCard({
  product,
  lots,
  onAddLot,
  onView,
  onSell,
  onEdit,
  onDelete,
  onArchiveToggle,
  onAdjust,
  fmt,
}: {
  product: Doc<"products">;
  lots: { unitCost: number; remaining: number }[];
  onAddLot: () => void;
  onView: () => void;
  onSell: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchiveToggle: () => void;
  onAdjust: (delta: number) => void;
  fmt: (v: number) => string;
}) {
  const t = useT();
  // Ascending, so the footer can read the cheapest and dearest off the ends.
  const lotCosts = [...lots].map((l) => l.unitCost).sort((a, b) => a - b);
  const out = product.quantity === 0;
  const low = product.quantity > 0 && product.quantity <= 3;
  const [showAll, setShowAll] = useState(false);
  // Roughly where three clamped lines end; below this there is nothing hidden
  // and an expand control would be noise.
  const clampable = product.details.length > 120;

  return (
    <Card
      className={cx(
        "group relative flex flex-col transition-all duration-300 ease-[var(--ease-out)]",
        "hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]",
        product.archived && "opacity-55",
      )}
    >
      {/*
        The action cluster is taken out of flow — while hidden it would still
        reserve its width and force the product name to truncate early.
      */}
      <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-0.5 rounded-xl bg-surface/90 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton label="Add lot" onClick={onAddLot}>
          <Layers size={15} />
        </IconButton>
        <IconButton label="Edit" onClick={onEdit}>
          <Pencil size={15} />
        </IconButton>
        <IconButton label={product.archived ? "Restore" : "Archive"} onClick={onArchiveToggle}>
          {product.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        </IconButton>
        <IconButton label="Delete" onClick={onDelete} danger>
          <Trash2 size={15} />
        </IconButton>
      </div>

      <div className="flex items-start gap-3 px-5 pt-5">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-[16px] font-bold text-white shadow-[var(--shadow-sm)]"
          style={{ background: gradientFor(product.name) }}
          aria-hidden
        >
          {initialOf(product.name)}
        </span>
        <button
          onClick={onView}
          className="mt-0.5 line-clamp-2 min-w-0 flex-1 text-left text-[15.5px] leading-5.5 font-bold tracking-tight text-ink transition-colors hover:text-accent"
        >
          {product.name}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 px-5">
        {product.archived && <Badge>Archived</Badge>}
        {product.category && <Badge tone="accent">{product.category}</Badge>}
        {out ? (
          <Badge tone="critical">Out of stock</Badge>
        ) : low ? (
          <Badge tone="warning">{product.quantity} left</Badge>
        ) : (
          <Badge tone="good">{product.quantity} in stock</Badge>
        )}
      </div>

      <div className="mt-4 px-5">
        <p
          className={cx(
            "min-h-10 text-[13.5px] leading-[1.6] whitespace-pre-wrap",
            product.details ? "text-ink-2" : "text-ink-3 italic",
            product.details && !showAll && "line-clamp-3",
          )}
        >
          {product.details || t("products.noDetails")}
        </p>
        {clampable && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-1 text-[12px] font-semibold text-accent hover:underline"
          >
            {showAll ? t("detail.showLess") : t("detail.showMore")}
          </button>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-line px-5 pt-4 pb-5">
        {/*
          Once a product has been bought at two prices, one cost figure is a
          lie of omission. The card shows the range it is actually sitting on
          and how many lots make it up.
        */}
        <div>
          <p className="text-[10.5px] font-bold tracking-[0.08em] text-ink-3 uppercase">
            Cost price
          </p>
          <p className="mt-1 text-[20px] leading-7 font-bold tracking-tight text-ink">
            {lotCosts.length > 0
              ? lotCosts[0] === lotCosts[lotCosts.length - 1]
                ? fmt(lotCosts[0])
                : `${fmt(lotCosts[0])}–${fmt(lotCosts[lotCosts.length - 1])}`
              : fmt(product.costPrice)}
          </p>
          {lots.length > 0 && (
            <button
              onClick={onView}
              className="mt-0.5 text-[11.5px] font-semibold text-accent hover:underline"
            >
              {lots.length} {lots.length === 1 ? "lot" : "lots"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-10 items-center rounded-xl border border-line-strong bg-page">
            <button
              onClick={() => onAdjust(-1)}
              disabled={product.quantity === 0}
              aria-label={`Remove one unit of ${product.name}`}
              className="flex size-9 items-center justify-center rounded-l-xl text-ink-3 transition-colors hover:text-ink disabled:opacity-30"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-7 text-center text-[13.5px] font-bold tabular-nums text-ink">
              {product.quantity}
            </span>
            <button
              onClick={() => onAdjust(1)}
              aria-label={`Add one unit of ${product.name}`}
              className="flex size-9 items-center justify-center rounded-r-xl text-ink-3 transition-colors hover:text-ink"
            >
              <Plus size={14} />
            </button>
          </div>
          <Button size="sm" variant="primary" onClick={onSell} disabled={out}>
            Sell
          </Button>
        </div>
      </div>
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2",
        danger ? "hover:text-critical" : "hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
