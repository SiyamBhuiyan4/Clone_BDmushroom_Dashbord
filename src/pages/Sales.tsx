import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button, Card, EmptyState, Input, Select, cx } from "../components/ui";
import { StatTile } from "../components/StatTile";
import { SellDialog } from "../components/SellDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSettings } from "../lib/settings";
import { gradientFor, initialOf } from "../lib/avatar";
import { CURRENCY_CODE, formatDateTime, percent, plural, startOfLocalDay } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedQuery, useAuthedMutation } from "../lib/session";

const DAY = 24 * 60 * 60 * 1000;
const RANGES = [
  { days: 0, label: "All time" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
];

export function SalesPage() {
  const { fmt } = useSettings();
  const toast = useToast();
  const sales = useAuthedQuery(api.sales.list, {});
  const products = useAuthedQuery(api.products.list, { includeArchived: true });
  const remove = useAuthedMutation(api.sales.remove);

  const [search, setSearch] = useState("");
  const [rangeDays, setRangeDays] = useState(0);
  const [sellOpen, setSellOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"sales"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"sales"> | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const since = rangeDays > 0 ? startOfLocalDay(Date.now() - (rangeDays - 1) * DAY) : 0;
    return (sales ?? []).filter((s) => {
      if (s.soldAt < since) return false;
      if (!term) return true;
      return (
        s.productName.toLowerCase().includes(term) ||
        (s.buyer ?? "").toLowerCase().includes(term) ||
        (s.note ?? "").toLowerCase().includes(term)
      );
    });
  }, [sales, search, rangeDays]);

  const totals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let units = 0;
    for (const s of rows) {
      revenue += s.unitPrice * s.quantity;
      cost += s.unitCost * s.quantity;
      units += s.quantity;
    }
    return { revenue, cost, profit: revenue - cost, units };
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // Clamp rather than reset: deleting the last row of page 4 should land on
  // page 3, not throw you back to the top of the ledger.
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [search, rangeDays, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const hasStock = (products ?? []).some((p) => !p.archived && p.quantity > 0);

  function exportCsv() {
    const header = [
      "Date",
      "Product",
      "Quantity",
      `Unit cost (${CURRENCY_CODE})`,
      `Unit price (${CURRENCY_CODE})`,
      `Revenue (${CURRENCY_CODE})`,
      `Profit (${CURRENCY_CODE})`,
      "Buyer",
      "Note",
    ];
    const body = rows.map((s) => [
      new Date(s.soldAt).toISOString(),
      s.productName,
      s.quantity,
      s.unitCost,
      s.unitPrice,
      s.unitPrice * s.quantity,
      (s.unitPrice - s.unitCost) * s.quantity,
      s.buyer ?? "",
      s.note ?? "",
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.ok(`Exported ${plural(rows.length, "sale")}.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-ink">Sales</h1>
          <p className="mt-1 text-[14px] text-ink-3">
            Every sale, with the profit it actually made.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={17} />
            Export CSV
          </Button>
          <Button
            variant="primary"
            onClick={() => setSellOpen(true)}
            disabled={!hasStock}
            title={!hasStock ? "Add a product with stock first" : undefined}
          >
            <Plus size={17} />
            Record sale
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 max-w-md flex-1">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, buyer or note"
            className="pl-10.5"
            aria-label="Search sales"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="ac-stagger grid gap-4 sm:grid-cols-3">
        <StatTile
          hero
          accent="violet"
          label="Profit"
          value={totals.profit < 0 ? `−${fmt(Math.abs(totals.profit))}` : fmt(totals.profit)}
          icon={<TrendingUp size={17} />}
          sub={totals.revenue > 0 ? `${percent(totals.profit / totals.revenue)} margin` : undefined}
        />
        <StatTile
          accent="sky"
          label="Revenue"
          value={fmt(totals.revenue)}
          icon={<CircleDollarSign size={17} />}
          sub={`${plural(rows.length, "sale")} · ${plural(totals.units, "unit")}`}
        />
        <StatTile
          accent="amber"
          label="Cost"
          value={fmt(totals.cost)}
          icon={<Wallet size={17} />}
          sub="What these units cost you"
        />
      </div>

      <Card>
        {sales === undefined ? (
          <div className="ac-skeleton h-72 rounded-card bg-surface" aria-hidden />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Receipt size={24} />}
            title={search || rangeDays ? "No matching sales" : "No sales yet"}
            body={
              search || rangeDays
                ? "Try a wider date range or a different search."
                : "Record your first sale and it will show up here with its profit worked out."
            }
            action={
              !search && !rangeDays && hasStock ? (
                <Button variant="primary" onClick={() => setSellOpen(true)}>
                  <Plus size={17} />
                  Record sale
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-bold tracking-[0.06em] text-ink-3 uppercase">
                  <th className="py-3.5 pl-6 font-bold">Product</th>
                  <th className="px-4 py-3.5 font-bold">Sold</th>
                  <th className="px-4 py-3.5 text-right font-bold">Qty</th>
                  <th className="px-4 py-3.5 text-right font-bold">Unit price</th>
                  <th className="px-4 py-3.5 text-right font-bold">Revenue</th>
                  <th className="px-4 py-3.5 text-right font-bold">Profit</th>
                  <th className="py-3.5 pr-5 pl-4 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => {
                  const revenue = s.unitPrice * s.quantity;
                  const profit = (s.unitPrice - s.unitCost) * s.quantity;
                  return (
                    <tr
                      key={s._id}
                      className="group border-b border-line last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="py-3 pl-6">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
                            style={{ background: gradientFor(s.productName) }}
                            aria-hidden
                          >
                            {initialOf(s.productName)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">{s.productName}</p>
                            {(s.buyer || s.note) && (
                              <p className="mt-0.5 max-w-72 truncate text-[12.5px] text-ink-3">
                                {[s.buyer, s.note].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[13.5px] text-ink-2">
                        {formatDateTime(s.soldAt)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-ink-2">
                        {s.quantity}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-2">
                        {fmt(s.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-ink">
                        {fmt(revenue)}
                      </td>
                      <td
                        className={cx(
                          "px-4 py-3 text-right font-bold tabular-nums",
                          profit < 0 ? "text-critical-ink" : "text-good-ink",
                        )}
                      >
                        {profit < 0 ? `−${fmt(Math.abs(profit))}` : `+${fmt(profit)}`}
                      </td>
                      <td className="py-3 pr-5 pl-4">
                        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            onClick={() => setEditing(s)}
                            aria-label={`Edit sale of ${s.productName}`}
                            className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeleting(s)}
                            aria-label={`Delete sale of ${s.productName}`}
                            className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-3 hover:text-critical"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* Totals span the whole filtered set, not just this page. */}
                <tr className="border-t border-line-strong bg-page/60 text-[13.5px]">
                  <td className="py-3.5 pl-6 font-bold text-ink-2" colSpan={2}>
                    {plural(rows.length, "sale")} total
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold tabular-nums text-ink-2">
                    {totals.units}
                  </td>
                  <td />
                  <td className="px-4 py-3.5 text-right font-bold tabular-nums text-ink">
                    {fmt(totals.revenue)}
                  </td>
                  <td
                    className={cx(
                      "px-4 py-3.5 text-right font-bold tabular-nums",
                      totals.profit < 0 ? "text-critical-ink" : "text-good-ink",
                    )}
                  >
                    {totals.profit < 0
                      ? `−${fmt(Math.abs(totals.profit))}`
                      : `+${fmt(totals.profit)}`}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={rows.length}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </Card>

      <SellDialog open={sellOpen} onClose={() => setSellOpen(false)} />
      <SellDialog open={editing !== null} onClose={() => setEditing(null)} sale={editing} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this sale?"
        body={
          deleting
            ? `The ${plural(deleting.quantity, "unit")} of ${deleting.productName} go back into stock, and the revenue and profit come off your totals.`
            : ""
        }
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove({ id: deleting._id });
            toast.ok("Sale deleted and stock restored.");
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Page numbers with an ellipsis, always showing first, last, current and its
 * neighbours — so the control keeps a stable width however many pages exist.
 */
function pageNumbers(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i);
  const out: (number | "gap")[] = [0];
  const from = Math.max(1, page - 1);
  const to = Math.min(pageCount - 2, page + 1);
  if (from > 1) out.push("gap");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pageCount - 2) out.push("gap");
  out.push(pageCount - 1);
  return out;
}

function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-4">
      <div className="flex items-center gap-3">
        <p className="text-[12.5px] text-ink-3">
          <span className="font-semibold tabular-nums text-ink-2">
            {first}–{last}
          </span>{" "}
          of <span className="font-semibold tabular-nums text-ink-2">{total}</span>
        </p>
        <label className="flex items-center gap-2">
          <span className="sr-only">Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-8 cursor-pointer rounded-lg border border-line-strong bg-page pl-2.5 pr-7 text-[12.5px] font-semibold text-ink-2 focus:border-accent focus:outline-none"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </label>
      </div>

      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <PageButton onClick={() => onPage(page - 1)} disabled={page === 0} label="Previous page">
            <ChevronLeft size={15} />
          </PageButton>

          {pageNumbers(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-[12.5px] text-ink-3" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                style={p === page ? { background: "var(--grad-violet)" } : undefined}
                className={cx(
                  "ac-press h-8 min-w-8 rounded-lg px-2 text-[12.5px] font-bold tabular-nums",
                  p === page ? "text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {p + 1}
              </button>
            ),
          )}

          <PageButton
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount - 1}
            label="Next page"
          >
            <ChevronRight size={15} />
          </PageButton>
        </nav>
      )}
    </div>
  );
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="ac-press flex size-8 items-center justify-center rounded-lg border border-line-strong bg-page text-ink-2 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}
