import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Coins, Plus, Trash2, Wallet } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AmountInput, Button, Card, CardHeader, EmptyState, Field, Input, Modal, ModalFooter } from "./ui";
import { StatTile } from "./StatTile";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { CURRENCY_SYMBOL, formatMonth, formatMonthShort, monthKey, shiftMonth } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

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
  // Kept apart from a `?? []` fallback: that would hand the effect below a
  // new array on every render — still undefined vs. loaded-but-empty is the
  // distinction that keeps the one-time seed from firing on every render.
  const categoriesQuery = useAuthedQuery(api.fixedCosts.listCategories);
  const detail = useAuthedQuery(api.fixedCosts.monthDetail, { month });
  const trend = useAuthedQuery(api.fixedCosts.monthlyTotals, { endMonth: month, count: 6 });
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
            <div className="min-w-36 text-center text-[15px] font-bold text-ink">{monthLabel}</div>
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
        <div className="ac-stagger grid gap-4 sm:grid-cols-2">
          <StatTile
            hero
            accent="amber"
            label={t("fixedCosts.total")}
            value={fmt(detail.total)}
            icon={<Wallet size={17} />}
            sub={monthLabel}
          />
          {trend && trend.length > 1 && (
            <Card>
              <CardHeader title={t("fixedCosts.recentMonths")} />
              <ul className="flex flex-col gap-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
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
            </Card>
          )}
        </div>
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
