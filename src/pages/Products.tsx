import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  Archive,
  Layers,
  Package,
  PackagePlus,
  Pencil,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button, Card, EmptyState, Input, Select, cx } from "../components/ui";
import { Pagination, SortSelect, usePagination } from "../components/Pagination";
import { useT } from "../lib/i18n";
import { ProductDialog } from "../components/ProductDialog";
import { ProductDetailDialog } from "../components/ProductDetailDialog";
import { SaleDialog } from "../components/SaleDialog";
import { BatchDialog } from "../components/BatchDialog";
import { PasscodeConfirmDialog } from "../components/PasscodeConfirmDialog";
import { SetStockDialog } from "../components/SetStockDialog";
import { RangePills } from "../components/RangePills";
import { useSettings } from "../lib/settings";
import { useRangeFilter } from "../lib/dateRange";
import { gradientFor, initialOf } from "../lib/avatar";
import { useToast } from "../lib/toast";
import { useAuthedQuery, useAuthedMutation } from "../lib/session";

type ProductRow = Doc<"products"> & { photoUrl: string | null };

type SortKey = "newest" | "name" | "stockLow" | "stockHigh" | "costHigh" | "profitHigh";

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
  const range = useRangeFilter("ac.range.products");
  const salesWindow = useAuthedQuery(api.products.salesWindow);

  // Per-product profit for the picked range: each sale already carries the
  // profit it actually made, so this is a sum, never a recalculation against
  // today's prices.
  const profitByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!salesWindow) return map;
    for (const s of salesWindow) {
      if (s.soldAt < range.since || s.soldAt >= range.untilExclusive) continue;
      map.set(s.productId, (map.get(s.productId) ?? 0) + s.profit);
    }
    return map;
  }, [salesWindow, range.since, range.untilExclusive]);

  const setStock = useAuthedMutation(api.products.setStock);
  /*
    Lots with stock left, so a card can say what this product actually cost —
    which is a range once it has been bought twice at two prices, not the one
    figure on the product.
  */
  const openLots = useAuthedQuery(api.profit.openLots) ?? [];
  const setArchived = useAuthedMutation(api.products.setArchived);
  const remove = useAuthedMutation(api.products.remove);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selling, setSelling] = useState<Doc<"products"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"products"> | null>(null);
  const [viewing, setViewing] = useState<Doc<"products"> | null>(null);
  const [lotFor, setLotFor] = useState<Doc<"products"> | null>(null);
  const [settingStock, setSettingStock] = useState<Doc<"products"> | null>(null);

  const visible = useMemo(() => {
    const filtered = (products ?? []).filter((p) => !category || p.category === category);
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stockLow") return a.quantity - b.quantity;
      if (sort === "stockHigh") return b.quantity - a.quantity;
      if (sort === "costHigh") return b.costPrice - a.costPrice;
      // Same figure the card shows: each sale's own snapshotted profit,
      // summed for whichever range is currently picked — never today's price.
      if (sort === "profitHigh") {
        return (profitByProduct.get(b._id) ?? 0) - (profitByProduct.get(a._id) ?? 0);
      }
      return b.createdAt - a.createdAt;
    });
  }, [products, category, sort, profitByProduct]);

  const pager = usePagination(visible, `${search}|${category}|${sort}|${showArchived}`, 25);

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
                { value: "profitHigh", label: t("products.sortProfitHigh") },
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

      {/* Scopes every card's profit figure — the same control as the Dashboard. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-ink-3">
          {t("products.profitFor")}{" "}
          <span className="font-semibold text-ink-2">{range.activeLabel.full}</span>
        </p>
        <RangePills range={range} />
      </div>

      {products === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="ac-skeleton h-96 rounded-card border border-line bg-surface" />
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
                onSetStock={() => setSettingStock(product)}
                fmt={fmt}
                profit={profitByProduct.get(product._id) ?? 0}
                rangeLabel={range.activeLabel.full}
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
      <SetStockDialog
        open={settingStock !== null}
        onClose={() => setSettingStock(null)}
        productName={settingStock?.name ?? ""}
        currentQuantity={settingStock?.quantity ?? 0}
        onConfirm={async (quantity, passcode) => {
          if (!settingStock) return;
          await setStock({ id: settingStock._id, quantity, passcode });
          toast.ok(t("toast.stockUpdated"));
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
  onSetStock,
  fmt,
  profit,
  rangeLabel,
}: {
  product: ProductRow;
  lots: { unitCost: number; remaining: number }[];
  onAddLot: () => void;
  onView: () => void;
  onSell: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchiveToggle: () => void;
  onSetStock: () => void;
  fmt: (v: number) => string;
  /** This product's actual profit in the page's selected date range. */
  profit: number;
  rangeLabel: string;
}) {
  const t = useT();
  // Ascending, so the footer can read the cheapest and dearest off the ends.
  const lotCosts = [...lots].map((l) => l.unitCost).sort((a, b) => a - b);
  const hasVariants = Boolean(product.variants?.length);
  const out = product.quantity === 0;
  const low = product.quantity > 0 && product.quantity <= 3;
  const [showAll, setShowAll] = useState(false);
  // Roughly where clamped lines end; below this there is nothing hidden and an expand control would be noise.
  const clampable = product.details.length > 120;

  return (
    <Card
      onClick={onView}
      className={cx(
        "group relative flex flex-col overflow-hidden transition-all duration-300 ease-[var(--ease-out)]",
        "hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]",
        product.archived && "opacity-60",
      )}
    >
      {/* -------------------- Top Hero Image Stage -------------------- */}
      <div className="relative h-48 w-full overflow-hidden bg-surface-2/40 border-b border-line flex items-center justify-center select-none">
        {product.photoUrl ? (
          <>
            <img
              src={product.photoUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="relative size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            {/* Top and bottom subtle gradient vignettes for perfect pill contrast */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/25" />
          </>
        ) : (
          <div
            className="relative size-full flex items-center justify-center overflow-hidden"
            style={{
              background: `radial-gradient(circle at 50% 40%, rgba(255,255,255,0.12), transparent 70%), ${gradientFor(product.name)}18`,
            }}
          >
            {/* Decorative watermark icon */}
            <Package
              size={110}
              strokeWidth={1}
              className="absolute -right-3 -bottom-5 text-ink/5 pointer-events-none transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6"
              aria-hidden
            />
            {/* Stylish fallback monogram */}
            <div
              className="relative flex size-16 items-center justify-center rounded-2xl text-[24px] font-bold text-white shadow-[var(--shadow-card)] ring-4 ring-surface/40 transition-transform duration-300 group-hover:scale-105"
              style={{ background: gradientFor(product.name) }}
              aria-hidden
            >
              {initialOf(product.name)}
            </div>
          </div>
        )}

        {/* Floating Top Badges (Category, Stock, Archived) */}
        <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 max-w-[calc(100%-8.5rem)]">
          {product.archived && (
            <span className="inline-flex items-center rounded-lg bg-surface/90 px-2.5 py-1 text-[11px] font-bold text-ink-2 shadow-[var(--shadow-sm)] backdrop-blur-md border border-line/60">
              Archived
            </span>
          )}
          {product.category && (
            <span className="inline-flex items-center rounded-lg bg-surface/90 px-2.5 py-1 text-[11px] font-bold text-accent shadow-[var(--shadow-sm)] backdrop-blur-md border border-accent/25">
              {product.category}
            </span>
          )}
          {out ? (
            <span className="inline-flex items-center rounded-lg bg-critical-solid/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-[var(--shadow-sm)] backdrop-blur-md">
              Out of stock
            </span>
          ) : low ? (
            <span className="inline-flex items-center rounded-lg bg-warning/95 px-2.5 py-1 text-[11px] font-bold text-white shadow-[var(--shadow-sm)] backdrop-blur-md">
              {product.quantity} left
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface/90 px-2.5 py-1 text-[11px] font-semibold text-good-ink shadow-[var(--shadow-sm)] backdrop-blur-md border border-good/25">
              <span className="size-1.5 rounded-full bg-good animate-pulse" />
              {product.quantity} in stock
            </span>
          )}
        </div>

        {/* Floating Quick Action Cluster */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded-xl border border-line-strong/30 bg-surface/90 p-1 shadow-[var(--shadow-card)] backdrop-blur-md transition-all duration-200 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"
        >
          <IconButton label="Add lot" onClick={onAddLot}>
            <Layers size={14} />
          </IconButton>
          <IconButton label="Edit" onClick={onEdit}>
            <Pencil size={14} />
          </IconButton>
          <IconButton label={product.archived ? "Restore" : "Archive"} onClick={onArchiveToggle}>
            {product.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </IconButton>
          <IconButton label="Delete" onClick={onDelete} danger>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>

      {/* -------------------- Card Content Body -------------------- */}
      <div className="flex flex-1 flex-col p-5">
        {/* Title */}
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={onView}
            className="text-left text-[16px] leading-snug font-bold tracking-tight text-ink transition-colors hover:text-accent line-clamp-2"
          >
            {product.name}
          </button>
        </div>

        {/* Description / Details */}
        <div className="mt-2 flex-1">
          <p
            className={cx(
              "text-[13px] leading-[1.6] whitespace-pre-wrap",
              product.details ? "text-ink-2" : "text-ink-3 italic",
              product.details && !showAll && "line-clamp-2",
            )}
          >
            {product.details || t("products.noDetails")}
          </p>
          {clampable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAll((v) => !v);
              }}
              className="mt-1 text-[11.5px] font-semibold text-accent hover:underline"
            >
              {showAll ? t("detail.showLess") : t("detail.showMore")}
            </button>
          )}
        </div>

        {/* ---------------- Financial Metrics Grid ---------------- */}
        <div className="mt-4 rounded-xl border border-line bg-surface-2/40 p-3">
          <div className="grid grid-cols-3 gap-2 divide-x divide-line">
            <div className="min-w-0 pr-1">
              <MoneyStat
                label="Cost price"
                value={
                  hasVariants
                    ? fmtRange(fmt, product.variants!.map((v) => v.costPrice))
                    : lotCosts.length > 0
                      ? lotCosts[0] === lotCosts[lotCosts.length - 1]
                        ? fmt(lotCosts[0])
                        : `${fmt(lotCosts[0])}–${fmt(lotCosts[lotCosts.length - 1])}`
                      : fmt(product.costPrice)
                }
              />
            </div>
            <div className="min-w-0 px-2">
              <MoneyStat
                label={t("products.sellPrice")}
                value={
                  hasVariants
                    ? fmtRange(
                        fmt,
                        product.variants!.map((v) => v.sellPrice).filter((p): p is number => p !== undefined),
                      )
                    : product.sellPrice !== undefined
                      ? fmt(product.sellPrice)
                      : "—"
                }
              />
            </div>
            <div className="min-w-0 pl-2">
              <MoneyStat
                label={t("sales.profit")}
                value={profit < 0 ? `−${fmt(Math.abs(profit))}` : fmt(profit)}
                tone={profit > 0 ? "good" : profit < 0 ? "critical" : undefined}
                sub={rangeLabel}
              />
            </div>
          </div>
        </div>

        {/* Active Lots Link */}
        {lots.length > 0 && (
          <div className="mt-2.5">
            <button
              onClick={onView}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-accent hover:underline transition-colors"
            >
              <Layers size={13} />
              <span>
                {lots.length} active {lots.length === 1 ? "lot" : "lots"}
              </span>
            </button>
          </div>
        )}

        {/* ---------------- Bottom Action Bar ---------------- */}
        <div
          className="mt-3.5 flex items-center justify-between gap-2 border-t border-line/60 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {!hasVariants && (
            <button
              onClick={onSetStock}
              aria-label={`Set stock for ${product.name}`}
              title="Quick adjust stock quantity"
              className="group/stock flex h-9.5 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-ink-3 transition-all hover:border-accent hover:bg-surface-2 hover:text-ink active:scale-95"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Stock</span>
              <span className="min-w-5 text-center text-[13.5px] font-bold tabular-nums text-ink">
                {product.quantity}
              </span>
              <Pencil size={12} className="text-ink-3 transition-colors group-hover/stock:text-accent" />
            </button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={onSell}
            disabled={out}
            className={cx("h-9.5", hasVariants ? "w-full" : "px-5")}
          >
            <ShoppingCart size={14} />
            Sell
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** A single figure when every value agrees, the low–high span otherwise. */
function fmtRange(fmt: (v: number) => string, values: number[]): string {
  if (values.length === 0) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
}

function MoneyStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "critical";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9.5px] font-bold tracking-wider text-ink-3 uppercase">{label}</p>
      <p
        className={cx(
          "mt-0.5 truncate text-[14px] leading-snug font-bold tracking-tight tabular-nums",
          tone === "good" ? "text-good-ink" : tone === "critical" ? "text-critical-ink" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 truncate text-[9.5px] font-medium text-ink-3" title={sub}>
          {sub}
        </p>
      )}
    </div>
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
        "rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2",
        danger ? "hover:bg-critical-soft hover:text-critical" : "hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
