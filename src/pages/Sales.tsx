import { useMemo, useState } from "react";
import {
  AlertTriangle,
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
import { Pagination, SortSelect, usePagination } from "../components/Pagination";
import { SellDialog } from "../components/SellDialog";
import { EraseDialog, type EraseScope } from "../components/EraseDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";
import { CURRENCY_CODE, plural, startOfLocalDay } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

const DAY = 24 * 60 * 60 * 1000;
type SortKey = "newest" | "oldest" | "profit" | "revenue";

export function SalesPage() {
  const { fmt, fmtNum, fmtPercent, fmtDateTime } = useSettings();
  const t = useT();
  const toast = useToast();
  const sales = useAuthedQuery(api.sales.list, {});
  const products = useAuthedQuery(api.products.list, { includeArchived: true });
  const remove = useAuthedMutation(api.sales.remove);

  const [search, setSearch] = useState("");
  const [rangeDays, setRangeDays] = useState(0);
  const [sort, setSort] = useState<SortKey>("newest");
  const [sellOpen, setSellOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"sales"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"sales"> | null>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [erase, setErase] = useState<EraseScope | null>(null);

  const RANGES = [
    { days: -1, label: t("sales.custom") },
    { days: 0, label: t("dash.allTime") },
    { days: 7, label: "7d" },
    { days: 30, label: "30d" },
    { days: 90, label: "90d" },
    { days: 365, label: "12m" },
  ];

  /*
    One place decides what "the current range" means, so the list on screen
    and the range an erase would remove can never drift apart.
  */
  const bounds = useMemo(() => {
    if (rangeDays === -1) {
      const from = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : 0;
      const to = customTo
        ? new Date(`${customTo}T23:59:59.999`).getTime()
        : Number.MAX_SAFE_INTEGER;
      return { from, to, custom: true };
    }
    if (rangeDays > 0) {
      return {
        from: startOfLocalDay(Date.now() - (rangeDays - 1) * DAY),
        to: Number.MAX_SAFE_INTEGER,
        custom: false,
      };
    }
    return { from: 0, to: Number.MAX_SAFE_INTEGER, custom: false };
  }, [rangeDays, customFrom, customTo]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (sales ?? []).filter((s) => {
      if (s.soldAt < bounds.from || s.soldAt > bounds.to) return false;
      if (!term) return true;
      return (
        s.productName.toLowerCase().includes(term) ||
        (s.buyer ?? "").toLowerCase().includes(term) ||
        (s.note ?? "").toLowerCase().includes(term)
      );
    });

    const profitOf = (s: Doc<"sales">) => (s.unitPrice - s.unitCost) * s.quantity;
    return [...filtered].sort((a, b) => {
      if (sort === "oldest") return a.soldAt - b.soldAt;
      if (sort === "profit") return profitOf(b) - profitOf(a);
      if (sort === "revenue") return b.unitPrice * b.quantity - a.unitPrice * a.quantity;
      return b.soldAt - a.soldAt;
    });
  }, [sales, search, bounds, sort]);

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

  const pager = usePagination(rows, `${search}|${rangeDays}|${customFrom}|${customTo}|${sort}`);
  const hasStock = (products ?? []).some((p) => !p.archived && p.quantity > 0);
  const rangeLabel =
    RANGES.find((r) => r.days === rangeDays)?.label ?? t("dash.allTime");

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
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {t("sales.title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3 sm:text-[14px]">{t("sales.subtitle")}</p>
        </div>
        <div className="flex w-full items-center gap-2.5 sm:w-auto">
          <Button
            variant="secondary"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex-1 sm:flex-none"
          >
            <Download size={17} />
            {t("sales.export")}
          </Button>
          <Button
            variant="primary"
            onClick={() => setSellOpen(true)}
            disabled={!hasStock}
            className="flex-1 sm:flex-none"
          >
            <Plus size={17} />
            {t("dash.recordSale")}
          </Button>
        </div>
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
            placeholder={t("sales.searchPlaceholder")}
            className="pl-10.5"
            aria-label={t("common.search")}
          />
        </div>
        <div className="flex w-full gap-3 sm:w-auto">
          <div className="flex-1 sm:w-40 sm:flex-none">
            <Select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
              aria-label={t("common.date")}
            >
              {RANGES.map((r) => (
                <option key={r.days} value={r.days}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1 sm:flex-none">
            <SortSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: "newest", label: t("sales.sortNewest") },
                { value: "oldest", label: t("sales.sortOldest") },
                { value: "profit", label: t("sales.sortProfitHigh") },
                { value: "revenue", label: t("sales.sortRevenueHigh") },
              ]}
            />
          </div>
        </div>

        {bounds.custom && (
          <div className="ac-fade-in flex w-full flex-wrap items-center gap-3">
            <label className="flex flex-1 items-center gap-2 sm:flex-none">
              <span className="shrink-0 text-[12.5px] font-semibold text-ink-3">
                {t("sales.from")}
              </span>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                max={customTo || undefined}
                aria-label={t("sales.from")}
                className="sm:w-44"
              />
            </label>
            <label className="flex flex-1 items-center gap-2 sm:flex-none">
              <span className="shrink-0 text-[12.5px] font-semibold text-ink-3">
                {t("sales.to")}
              </span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                min={customFrom || undefined}
                aria-label={t("sales.to")}
                className="sm:w-44"
              />
            </label>
            {(customFrom || customTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCustomFrom("");
                  setCustomTo("");
                }}
              >
                {t("sales.clearDates")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="ac-stagger grid gap-4 sm:grid-cols-3">
        <StatTile
          hero
          accent="violet"
          label={t("sales.profit")}
          value={totals.profit < 0 ? `−${fmt(Math.abs(totals.profit))}` : fmt(totals.profit)}
          icon={<TrendingUp size={17} />}
          sub={
            totals.revenue > 0
              ? `${fmtPercent(totals.profit / totals.revenue)} ${t("dash.margin")}`
              : undefined
          }
        />
        <StatTile
          accent="sky"
          label={t("sales.revenue")}
          value={fmt(totals.revenue)}
          icon={<CircleDollarSign size={17} />}
          sub={`${fmtNum(rows.length)} · ${fmtNum(totals.units)} ${t("common.units")}`}
        />
        <StatTile
          accent="amber"
          label={t("sales.cost")}
          value={fmt(totals.cost)}
          icon={<Wallet size={17} />}
        />
      </div>

      <Card>
        {sales === undefined ? (
          <div className="ac-skeleton h-72 rounded-card bg-surface" aria-hidden />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Receipt size={24} />}
            title={search || rangeDays ? t("sales.noMatches") : t("sales.none")}
            body={
              search || rangeDays
                ? "Try a wider date range or a different search."
                : "Record your first sale and it will show up here with its profit worked out."
            }
            action={
              !search && !rangeDays && hasStock ? (
                <Button variant="primary" onClick={() => setSellOpen(true)}>
                  <Plus size={17} />
                  {t("dash.recordSale")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/*
              Cards on phones, table from md up. The table used to carry a
              min-width of 56rem, which forced a sideways scroll on every
              phone — shrinking the type would not have fixed that.
            */}
            <ul className="flex flex-col divide-y divide-line md:hidden">
              {pager.pageRows.map((s) => {
                const revenue = s.unitPrice * s.quantity;
                const profit = (s.unitPrice - s.unitCost) * s.quantity;
                return (
                  <li key={s._id} className="flex flex-col gap-2.5 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
                        style={{ background: gradientFor(s.productName) }}
                        aria-hidden
                      >
                        {initialOf(s.productName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-ink">{s.productName}</p>
                        <p className="mt-0.5 text-[12px] text-ink-3">{fmtDateTime(s.soldAt)}</p>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          onClick={() => setEditing(s)}
                          aria-label={`${t("common.edit")} ${s.productName}`}
                          className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-ink"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleting(s)}
                          aria-label={`${t("common.delete")} ${s.productName}`}
                          className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-critical"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {(s.buyer || s.note) && (
                      <p className="text-[12.5px] text-ink-3">
                        {[s.buyer, s.note].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <dl className="grid grid-cols-3 gap-2 rounded-xl bg-page px-3 py-2.5">
                      <MobileCell label={t("sales.qty")} value={fmtNum(s.quantity)} />
                      <MobileCell label={t("sales.revenue")} value={fmt(revenue)} />
                      <MobileCell
                        label={t("sales.profit")}
                        value={profit < 0 ? `−${fmt(Math.abs(profit))}` : `+${fmt(profit)}`}
                        tone={profit < 0 ? "critical" : "good"}
                      />
                    </dl>
                  </li>
                );
              })}
            </ul>

            <div className="hidden md:block">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-bold tracking-[0.06em] text-ink-3 uppercase">
                    <th className="py-3.5 pl-6 font-bold">{t("sales.product")}</th>
                    <th className="px-4 py-3.5 font-bold">{t("sales.sold")}</th>
                    <th className="px-4 py-3.5 text-right font-bold">{t("sales.qty")}</th>
                    <th className="px-4 py-3.5 text-right font-bold">{t("sales.unitPrice")}</th>
                    <th className="px-4 py-3.5 text-right font-bold">{t("sales.revenue")}</th>
                    <th className="px-4 py-3.5 text-right font-bold">{t("sales.profit")}</th>
                    <th className="py-3.5 pr-5 pl-4" />
                  </tr>
                </thead>
                <tbody>
                  {pager.pageRows.map((s) => {
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
                          {fmtDateTime(s.soldAt)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-ink-2">
                          {fmtNum(s.quantity)}
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
                              aria-label={`${t("common.edit")} ${s.productName}`}
                              className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setDeleting(s)}
                              aria-label={`${t("common.delete")} ${s.productName}`}
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
                      {t("common.total")} · {fmtNum(rows.length)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold tabular-nums text-ink-2">
                      {fmtNum(totals.units)}
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

            <Pagination
              page={pager.page}
              pageCount={pager.pageCount}
              pageSize={pager.pageSize}
              total={pager.total}
              onPage={pager.setPage}
              onPageSize={pager.setPageSize}
            />
          </>
        )}
      </Card>

      {/*
        Kept at the bottom, visually separated and in the critical colour, so
        it is never adjacent to something you click routinely.
      */}
      <Card className="border-[color-mix(in_srgb,var(--critical)_25%,transparent)]">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
              <AlertTriangle size={16} className="text-critical" aria-hidden />
              {t("sales.dangerZone")}
            </h2>
            <p className="mt-1.5 max-w-lg text-[13px] leading-6 text-ink-3">
              {t("sales.dangerBody")}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <Button
              variant="secondary"
              onClick={() =>
                setErase({
                  kind: "range",
                  from: bounds.from,
                  to: Math.min(bounds.to, Date.now() + DAY),
                  label: rangeLabel,
                })
              }
              disabled={rows.length === 0}
              className="text-critical-ink"
            >
              <Trash2 size={16} />
              {t("sales.eraseRange")}
            </Button>
            <Button variant="danger" onClick={() => setErase({ kind: "all" })}>
              <Trash2 size={16} />
              {t("sales.eraseAll")}
            </Button>
          </div>
        </div>
      </Card>

      <EraseDialog
        open={erase !== null}
        onClose={() => setErase(null)}
        scope={erase}
        onDone={() => {
          setCustomFrom("");
          setCustomTo("");
          setRangeDays(0);
        }}
      />

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

function MobileCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "critical";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold tracking-wide text-ink-3 uppercase">{label}</dt>
      <dd
        className={cx(
          "mt-0.5 truncate text-[13.5px] font-bold tabular-nums",
          tone === "good" ? "text-good-ink" : tone === "critical" ? "text-critical-ink" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
