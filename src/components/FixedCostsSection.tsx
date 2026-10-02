import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Coins, Plus, Trash2, Wallet } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AmountInput, Button, Card, cx, EmptyState, Field, Input, Modal, ModalFooter } from "./ui";
import { StatTile } from "./StatTile";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { MonthPickerDialog } from "./MonthPickerDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import {
  CURRENCY_SYMBOL,
  formatMonth,
  formatMonthShort,
  monthKey,
  monthsBetween,
  shiftMonth,
} from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

const MONTH_RANGE_PRESETS = [3, 6, 12] as const;
type MonthRangeChoice = (typeof MONTH_RANGE_PRESETS)[number] | "custom";

/**
 * Rent, bills, salary — the handful of things a shop pays every month no
 * matter what. Unlike the costs ledger above (logged as spent, browsed by
 * date range), these are booked once per calendar month against a small set
 * of folders, and browsed month by month: "what was October's rent" is the
 * question, not "costs between these two dates."
 */
export function FixedCostsSection() {
  const { fmt, fmtNum, lang } = useSettings();
  const t = useT();
  const toast = useToast();

  const [month, setMonth] = useState(() => monthKey(Date.now()));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // Kept apart from a `?? []` fallback: that would hand the effect below a
  // new array on every render — still undefined vs. loaded-but-empty is the
  // distinction that keeps the one-time seed from firing on every render.
  const categoriesQuery = useAuthedQuery(api.fixedCosts.listCategories);
  const detail = useAuthedQuery(api.fixedCosts.monthDetail, { month });

  /*
    A second, independent window from the single month being edited above —
    "how much went to rent and bills over the last 6 months" is a different
    question from "what was October's rent", and answering it by paging
    through one month at a time would be the same complaint this replaced.
  */
  const [rangeChoice, setRangeChoice] = useState<MonthRangeChoice>(3);
  const thisMonth = monthKey(Date.now());
  const [customFrom, setCustomFrom] = useState(() => shiftMonth(thisMonth, -2));
  const [customTo, setCustomTo] = useState(thisMonth);
  const { rangeEndMonth, rangeCount } = useMemo(() => {
    if (rangeChoice !== "custom") return { rangeEndMonth: thisMonth, rangeCount: rangeChoice };
    const [start, end] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    return { rangeEndMonth: end, rangeCount: Math.max(1, Math.min(36, monthsBetween(start, end) + 1)) };
  }, [rangeChoice, customFrom, customTo, thisMonth]);
  const trend = useAuthedQuery(api.fixedCosts.monthlyTotals, {
    endMonth: rangeEndMonth,
    count: rangeCount,
  });
  const rangeTotal = useMemo(() => (trend ?? []).reduce((sum, m) => sum + m.total, 0), [trend]);

  const seedCategories = useAuthedMutation(api.fixedCosts.seedCategories);
  const setAmount = useAuthedMutation(api.fixedCosts.setAmount);
  const addCategory = useAuthedMutation(api.fixedCosts.addCategory);
  const removeCategory = useAuthedMutation(api.fixedCosts.removeCategory);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<{ id: Id<"fixedCostCategories">; name: string } | null>(null);

  // The very first visit has nothing saved — offer the starter folders
  // instead of a blank page with nowhere to start.
  useEffect(() => {
    if (categoriesQuery !== undefined && categoriesQuery.length === 0) void seedCategories({});
  }, [categoriesQuery, seedCategories]);

  // A fresh draft per row whenever the month (or its saved amounts) change —
  // typing in one month must never leak into the next.
  useEffect(() => {
    if (!detail) return;
    const next: Record<string, string> = {};
    for (const row of detail.rows) next[row.categoryId] = row.amount !== null ? String(row.amount) : "";
    setDrafts(next);
  }, [detail]);

  async function saveRow(categoryId: Id<"fixedCostCategories">, raw: string) {
    const trimmed = raw.trim();
    const amount = trimmed === "" ? undefined : Number(trimmed);
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      toast.error("Amount must be zero or more.");
      return;
    }
    try {
      await setAmount({ month, categoryId, amount });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      await addCategory({ name: newName });
      toast.ok(t("fixedCosts.categoryAdded"));
      setNewName("");
      setAddOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = formatMonth(month, lang);
  const isCurrentMonth = month === monthKey(Date.now());

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label={t("fixedCosts.prevMonth")}
            >
              <ChevronLeft size={16} />
            </Button>
            <button
              type="button"
              onClick={() => setMonthPickerOpen(true)}
              className="flex min-w-36 items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[15px] font-bold text-ink transition-colors hover:bg-surface-2"
              aria-label={t("fixedCosts.pickMonth")}
            >
              <CalendarDays size={15} className="text-ink-3" />
              {monthLabel}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label={t("fixedCosts.nextMonth")}
            >
              <ChevronRight size={16} />
            </Button>
            {!isCurrentMonth && (
              <button
                onClick={() => setMonth(monthKey(Date.now()))}
                className="ml-1 text-[12.5px] font-semibold text-accent hover:underline"
              >
                {t("fixedCosts.thisMonth")}
              </button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={15} />
            {t("fixedCosts.addCategory")}
          </Button>
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {detail === undefined ? (
            <div className="ac-skeleton h-40 rounded-card bg-surface" aria-hidden />
          ) : detail.rows.length === 0 ? (
            <EmptyState
              icon={<Coins size={24} />}
              title={t("fixedCosts.noCategories")}
              body={t("fixedCosts.noCategoriesBody")}
              action={
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <Plus size={17} />
                  {t("fixedCosts.addCategory")}
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {detail.rows.map((row) => (
                <li
                  key={row.categoryId}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-page px-3.5 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                    {row.name}
                  </span>
                  <div className="w-36 shrink-0">
                    <AmountInput
                      symbol={CURRENCY_SYMBOL}
                      value={drafts[row.categoryId] ?? ""}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [row.categoryId]: e.target.value }))
                      }
                      onBlur={(e) => void saveRow(row.categoryId, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <button
                    onClick={() => setDeleting({ id: row.categoryId, name: row.name })}
                    aria-label={`${t("common.delete")} ${row.name}`}
                    className="shrink-0 rounded-lg p-2 text-ink-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-critical group-hover:opacity-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {detail && detail.rows.length > 0 && (
        <>
          <StatTile
            hero
            accent="amber"
            label={t("fixedCosts.total")}
            value={fmt(detail.total)}
            icon={<Wallet size={17} />}
            sub={monthLabel}
          />

          {/*
            A second, independent window: "how much over the last several
            months" is a different question from "what was this one month",
            and answering it by paging through one month at a time was the
            exact complaint this replaced.
          */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <h2 className="text-[16px] font-bold tracking-tight text-ink">
                {t("fixedCosts.rangeTotal")}
              </h2>
              <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1">
                {MONTH_RANGE_PRESETS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setRangeChoice(n)}
                    aria-pressed={rangeChoice === n}
                    style={rangeChoice === n ? { background: "var(--grad-violet)" } : undefined}
                    className={cx(
                      "h-8 rounded-lg px-3 text-[12.5px] font-bold transition-all",
                      rangeChoice === n ? "text-white" : "text-ink-3 hover:text-ink",
                    )}
                  >
                    {n}
                    {t("fixedCosts.monthAbbr")}
                  </button>
                ))}
                <button
                  onClick={() => setRangeChoice("custom")}
                  aria-pressed={rangeChoice === "custom"}
                  style={rangeChoice === "custom" ? { background: "var(--grad-violet)" } : undefined}
                  className={cx(
                    "h-8 rounded-lg px-3 text-[12.5px] font-bold transition-all",
                    rangeChoice === "custom" ? "text-white" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {t("fixedCosts.customRange")}
                </button>
              </div>
            </div>

            {rangeChoice === "custom" && (
              <div className="flex flex-wrap items-center gap-3 px-5 pt-4 sm:px-6">
                <Input
                  type="month"
                  value={customFrom}
                  onChange={(e) => e.target.value && setCustomFrom(e.target.value)}
                  max={thisMonth}
                  aria-label={t("fixedCosts.prevMonth")}
                  className="w-auto"
                />
                <span className="text-ink-3">–</span>
                <Input
                  type="month"
                  value={customTo}
                  onChange={(e) => e.target.value && setCustomTo(e.target.value)}
                  max={thisMonth}
                  aria-label={t("fixedCosts.nextMonth")}
                  className="w-auto"
                />
              </div>
            )}

            <div className="px-5 pt-4 sm:px-6">
              <p className="text-[28px] leading-9 font-bold tracking-tight tabular-nums text-ink">
                {fmt(rangeTotal)}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                {formatMonthShort(trend?.[0]?.month ?? rangeEndMonth, lang)} –{" "}
                {formatMonthShort(rangeEndMonth, lang)}
              </p>
            </div>

            {trend && trend.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
                {trend.map((m) => {
                  const max = Math.max(...trend.map((r) => r.total), 1);
                  const share = m.total / max;
                  return (
                    <li key={m.month}>
                      <button
                        onClick={() => setMonth(m.month)}
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span
                          className={
                            "w-14 shrink-0 text-[12px] font-semibold " +
                            (m.month === month ? "text-accent" : "text-ink-3")
                          }
                        >
                          {formatMonthShort(m.month, lang)}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]"
                            style={{ width: `${Math.max(share * 100, 2)}%`, background: "var(--grad-amber)" }}
                          />
                        </span>
                        <span className="w-20 shrink-0 text-right text-[12.5px] font-bold tabular-nums text-ink">
                          {fmtNum(m.total) === "0" ? fmt(0) : fmt(m.total)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("fixedCosts.addCategoryTitle")}
      >
        <form onSubmit={submitCategory}>
          <div className="flex flex-col gap-5 px-6 py-6">
            <Field label={t("fixedCosts.categoryName")}>
              {(id) => (
                <Input
                  id={id}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("fixedCosts.categoryPlaceholder")}
                  autoComplete="off"
                  autoFocus
                  required
                />
              )}
            </Field>
          </div>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={!newName.trim() || saving}>
              {saving ? t("common.saving") : t("common.add")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <MonthPickerDialog
        open={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        value={month}
        onSelect={setMonth}
      />

      <PasscodeConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("fixedCosts.removeCategoryTitle")}
        body={deleting ? `${deleting.name}\n${t("fixedCosts.removeCategoryBody")}` : ""}
        onConfirm={async (passcode) => {
          if (!deleting) return;
          await removeCategory({ id: deleting.id, passcode });
          toast.ok(t("fixedCosts.categoryRemoved"));
        }}
      />
    </div>
  );
}
