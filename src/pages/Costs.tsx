import { useMemo, useState } from "react";
import {
  BookMarked,
  CalendarDays,
  Coins,
  Download,
  Hash,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button, Card, CardHeader, EmptyState, Input, Select } from "../components/ui";
import { StatTile } from "../components/StatTile";
import { Pagination, SortSelect, usePagination } from "../components/Pagination";
import { CostDialog } from "../components/CostDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";
import { CURRENCY_CODE, plural, startOfLocalDay } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { usePersistedState } from "../lib/persist";

const DAY = 24 * 60 * 60 * 1000;
type SortKey = "newest" | "oldest" | "highest" | "lowest";

export function CostsPage() {
  const { fmt, fmtNum, fmtDateTime } = useSettings();
  const t = useT();
  const toast = useToast();
  const costs = useAuthedQuery(api.costs.list, {});
  const names = useAuthedQuery(api.costs.names) ?? [];
  const remove = useAuthedMutation(api.costs.remove);
  const recreate = useAuthedMutation(api.costs.create);
  const removeName = useAuthedMutation(api.costs.removeName);

  const [search, setSearch] = useState("");
  const [rangeDays, setRangeDays] = useState(0);
  const [nameFilter, setNameFilter] = useState("");
  const [sort, setSort] = usePersistedState<SortKey>("ac.sort.costs", "newest");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"costs"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"costs"> | null>(null);
  const [droppingName, setDroppingName] = useState<{ id: Id<"costNames">; name: string } | null>(
    null,
  );

  const RANGES = [
    { days: 0, label: t("dash.allTime") },
    { days: 7, label: "7d" },
    { days: 30, label: "30d" },
    { days: 90, label: "90d" },
    { days: 365, label: "12m" },
  ];

  const from = useMemo(
    () => (rangeDays > 0 ? startOfLocalDay(Date.now() - (rangeDays - 1) * DAY) : 0),
    [rangeDays],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (costs ?? []).filter((c) => {
      if (c.spentAt < from) return false;
      if (nameFilter && c.name !== nameFilter) return false;
      if (!term) return true;
      return c.name.toLowerCase().includes(term) || (c.note ?? "").toLowerCase().includes(term);
    });

    return [...filtered].sort((a, b) => {
      if (sort === "oldest") return a.spentAt - b.spentAt;
      if (sort === "highest") return b.amount - a.amount;
      if (sort === "lowest") return a.amount - b.amount;
      return b.spentAt - a.spentAt;
    });
  }, [costs, search, from, nameFilter, sort]);

  const total = useMemo(() => rows.reduce((sum, c) => sum + c.amount, 0), [rows]);

  /*
    Where the money actually went, which is the question the page exists to
    answer — a list of forty rows does not answer it, and a total answers only
    half of it. Grouped by name, biggest first.
  */
  const byName = useMemo(() => {
    const groups = new Map<string, { name: string; amount: number; count: number }>();
    for (const c of rows) {
      const key = c.name.toLowerCase();
      const entry = groups.get(key) ?? { name: c.name, amount: 0, count: 0 };
      entry.amount += c.amount;
      entry.count += 1;
      groups.set(key, entry);
    }
    return [...groups.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);

  // Every distinct name that appears in the ledger, for the filter — a name
  // dropped from the saved list still has its history worth filtering by.
  const ledgerNames = useMemo(() => {
    const set = new Set((costs ?? []).map((c) => c.name));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [costs]);

  const saved = names.filter((n) => !n.suggestion);
  const pager = usePagination(rows, `${search}|${rangeDays}|${sort}|${nameFilter}`);
  const biggest = byName[0];

  function exportCsv() {
    const header = ["Date", "Cost", `Amount (${CURRENCY_CODE})`, "Note"];
    const body = rows.map((c) => [
      new Date(c.spentAt).toISOString(),
      c.name,
      c.amount,
      c.note ?? "",
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `costs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.ok(`Exported ${plural(rows.length, "cost")}.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {t("costs.title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3 sm:text-[14px]">{t("costs.subtitle")}</p>
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
          <Button variant="primary" onClick={() => setAddOpen(true)} className="flex-1 sm:flex-none">
            <Plus size={17} />
            {t("costs.add")}
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
            placeholder={t("costs.searchPlaceholder")}
            className="pl-10.5"
            aria-label={t("common.search")}
          />
        </div>
        <div className="flex w-full gap-3 sm:w-auto">
          <div className="flex-1 sm:w-36 sm:flex-none">
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
          <div className="flex-1 sm:w-56 sm:flex-none">
            <Select
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              aria-label={t("costs.whatFor")}
            >
              <option value="">{t("costs.allNames")}</option>
              {ledgerNames.map((n) => (
                <option key={n} value={n}>
                  {n}
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
                { value: "highest", label: t("costs.sortHighest") },
                { value: "lowest", label: t("costs.sortLowest") },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="ac-stagger grid gap-4 sm:grid-cols-3">
        <StatTile
          hero
          accent="amber"
          label={t("costs.totalSpent")}
          value={fmt(total)}
          icon={<Wallet size={17} />}
          sub={RANGES.find((r) => r.days === rangeDays)?.label}
        />
        <StatTile
          accent="violet"
          label={t("costs.entries")}
          value={fmtNum(rows.length)}
          icon={<Hash size={17} />}
          sub={`${fmtNum(byName.length)} ${t("costs.distinctNames")}`}
        />
        <StatTile
          accent="sky"
          label={t("costs.biggest")}
          value={biggest ? fmt(biggest.amount) : fmt(0)}
          icon={<CalendarDays size={17} />}
          sub={biggest?.name}
        />
      </div>

      {/* --------------------------------------------------- where it went */}
      {byName.length > 0 && (
        <Card>
          <CardHeader title={t("costs.whereItWent")} subtitle={t("costs.whereItWentSub")} />
          <ul className="flex flex-col gap-3 px-5 pb-5 sm:px-6 sm:pb-6">
            {byName.slice(0, 6).map((g) => {
              const share = total > 0 ? g.amount / total : 0;
              return (
                <li key={g.name} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">
                      {g.name}
                    </span>
                    <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-ink">
                      {fmt(g.amount)}
                      <span className="ml-2 text-[11.5px] font-semibold text-ink-3">
                        {fmtNum(g.count)}×
                      </span>
                    </span>
                  </div>
                  {/* The bar is the comparison; the number is the fact. */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]"
                      style={{ width: `${Math.max(share * 100, 1.5)}%`, background: "var(--grad-amber)" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* --------------------------------------------------------- ledger */}
      <Card>
        {costs === undefined ? (
          <div className="ac-skeleton h-72 rounded-card bg-surface" aria-hidden />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Coins size={24} />}
            title={search || rangeDays || nameFilter ? t("costs.noMatches") : t("costs.none")}
            body={
              search || rangeDays || nameFilter
                ? "Try a wider date range or a different search."
                : "Office snacks, fuel, a bill — anything the business paid for that was not stock."
            }
            action={
              !search && !rangeDays && !nameFilter ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <Plus size={17} />
                  {t("costs.add")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line md:hidden">
              {pager.pageRows.map((c) => (
                <li key={c._id} className="flex items-start gap-3 px-4 py-4">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
                    style={{ background: gradientFor(c.name) }}
                    aria-hidden
                  >
                    {initialOf(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink">{c.name}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">{fmtDateTime(c.spentAt)}</p>
                    {c.note && <p className="mt-1 text-[12.5px] text-ink-3">{c.note}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[14px] font-bold tabular-nums text-ink">
                      {fmt(c.amount)}
                    </span>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => setEditing(c)}
                        aria-label={`${t("common.edit")} ${c.name}`}
                        className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleting(c)}
                        aria-label={`${t("common.delete")} ${c.name}`}
                        className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden md:block">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-bold tracking-[0.06em] text-ink-3 uppercase">
                    <th className="py-3.5 pl-6 font-bold">{t("costs.whatFor")}</th>
                    <th className="px-4 py-3.5 font-bold">{t("costs.spentOn")}</th>
                    <th className="px-4 py-3.5 text-right font-bold">{t("costs.amount")}</th>
                    <th className="py-3.5 pr-5 pl-4" />
                  </tr>
                </thead>
                <tbody>
                  {pager.pageRows.map((c) => (
                    <tr
                      key={c._id}
                      className="group border-b border-line last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="py-3 pl-6">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
                            style={{ background: gradientFor(c.name) }}
                            aria-hidden
                          >
                            {initialOf(c.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">{c.name}</p>
                            {c.note && (
                              <p className="mt-0.5 max-w-96 truncate text-[12.5px] text-ink-3">
                                {c.note}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[13.5px] text-ink-2">
                        {fmtDateTime(c.spentAt)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-ink">
                        {fmt(c.amount)}
                      </td>
                      <td className="py-3 pr-5 pl-4">
                        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            onClick={() => setEditing(c)}
                            aria-label={`${t("common.edit")} ${c.name}`}
                            className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeleting(c)}
                            aria-label={`${t("common.delete")} ${c.name}`}
                            className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-3 hover:text-critical"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* Totals span the whole filtered set, not just this page. */}
                  <tr className="border-t border-line-strong bg-page/60 text-[13.5px]">
                    <td className="py-3.5 pl-6 font-bold text-ink-2" colSpan={2}>
                      {t("common.total")} · {fmtNum(rows.length)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold tabular-nums text-ink">
                      {fmt(total)}
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

      {/* ---------------------------------------------------- saved names */}
      <Card>
        <CardHeader title={t("costs.savedNames")} subtitle={t("costs.savedNamesSub")} />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {saved.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-ink-3">
              <BookMarked size={15} aria-hidden />
              {t("costs.noSavedNames")}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {saved.map((n) => (
                <li
                  key={n._id}
                  className="group flex items-center gap-2 rounded-xl border border-line-strong bg-page py-1.5 pr-1.5 pl-3"
                >
                  <span className="text-[13px] font-semibold text-ink">{n.name}</span>
                  <span className="text-[11.5px] font-bold tabular-nums text-ink-3">
                    {fmtNum(n.usageCount)}×
                  </span>
                  <button
                    onClick={() => n._id && setDroppingName({ id: n._id as Id<"costNames">, name: n.name })}
                    aria-label={`${t("common.delete")} ${n.name}`}
                    className="rounded-lg p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-critical"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <CostDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <CostDialog open={editing !== null} onClose={() => setEditing(null)} cost={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("costs.deleteTitle")}
        body={
          deleting
            ? `${deleting.name} — ${fmt(deleting.amount)} comes off your cost totals.`
            : ""
        }
        onConfirm={async () => {
          if (!deleting) return;
          const snapshot = deleting;
          try {
            await remove({ id: snapshot._id });
            // The same protection a deleted sale gets: re-recording restores
            // the same figures under a new id, which nothing else references.
            toast.undoable(t("costs.deleted"), {
              label: t("toast.undo"),
              run: async () => {
                try {
                  await recreate({
                    name: snapshot.name,
                    amount: snapshot.amount,
                    spentAt: snapshot.spentAt,
                    note: snapshot.note ?? "",
                    saveName: false,
                  });
                  toast.ok(t("costs.restored"));
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              },
            });
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />

      <ConfirmDialog
        open={droppingName !== null}
        onClose={() => setDroppingName(null)}
        title={t("costs.dropNameTitle")}
        confirmLabel={t("costs.dropName")}
        body={droppingName ? t("costs.dropNameBody") : ""}
        onConfirm={async () => {
          if (!droppingName) return;
          try {
            await removeName({ id: droppingName.id });
            toast.ok(t("costs.nameDropped"));
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}
