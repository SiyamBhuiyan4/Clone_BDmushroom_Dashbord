import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Layers,
  Pencil,
  PieChart,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge, Button, Card, CardHeader, EmptyState, cx } from "../components/ui";
import { StatTile } from "../components/StatTile";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { BatchDialog, type BatchRow } from "../components/BatchDialog";
import { DateRangeControls, rangeLabel, useDateRange } from "../components/DateRange";
import { PasscodeConfirmDialog } from "../components/PasscodeConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT, type MessageKey } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";
import { plural } from "../lib/format";
import { useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

/** One bucket's share of an amount. Percentages already total 100. */
function share(amount: number, pct: number) {
  return (amount * pct) / 100;
}

const BUCKET_ACCENTS = [
  "var(--grad-violet)",
  "var(--grad-sky)",
  "var(--grad-emerald)",
  "var(--grad-amber)",
];

type Basis = "projected" | "realised";

export function ProfitPage() {
  const { fmt, fmtNum, fmtPercent, fmtDateFull } = useSettings();
  const t = useT();
  const toast = useToast();
  const data = useAuthedQuery(api.profit.summary);
  const removeBatch = useAuthedMutation(api.profit.removeBatch);

  const [basis, setBasis] = useState<Basis>("projected");
  const range = useDateRange(0, "ac.range.profit");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<BatchRow | null>(null);
  const [deleting, setDeleting] = useState<BatchRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  /*
    Both sides of the page answer to the same range: lots by their purchase
    date, sales by the date they were sold. A split scoped to one but not the
    other would be quietly wrong.
  */
  const { from, to } = range.bounds;
  const scoped = useMemo(() => {
    if (!data) return null;
    // Depend on the bounds, not the hook's return value — that object is new
    // on every render and would defeat the memo entirely.
    const within = (ts: number) => ts >= from && ts <= to;
    const batches = data.batches.filter((b) => within(b.purchasedAt));
    const sales = data.sales.filter((s) => within(s.soldAt));

    let projected = 0;
    let cost = 0;
    let revenue = 0;
    for (const b of batches) {
      projected += b.totalProfit;
      cost += b.totalCost;
      revenue += b.totalRevenue;
    }

    let realisedProfit = 0;
    let realisedRevenue = 0;
    const byProduct = new Map<string, { profit: number; units: number }>();
    for (const s of sales) {
      realisedProfit += s.profit;
      realisedRevenue += s.revenue;
      const e = byProduct.get(s.productId) ?? { profit: 0, units: 0 };
      e.profit += s.profit;
      e.units += s.units;
      byProduct.set(s.productId, e);
    }

    return {
      batches,
      byProduct,
      totals: {
        profit: projected,
        cost,
        revenue,
        lots: batches.length,
        margin: revenue > 0 ? projected / revenue : 0,
      },
      realised: { profit: realisedProfit, revenue: realisedRevenue, sales: sales.length },
    };
  }, [data, from, to]);

  const products = useMemo(() => {
    if (!data || !scoped) return [];
    const realised = scoped.byProduct;
    const map = new Map<
      string,
      {
        productId: string;
        name: string;
        projected: number;
        realised: number;
        soldUnits: number;
        units: number;
        batches: typeof data.batches;
      }
    >();
    for (const b of scoped.batches) {
      const entry = map.get(b.productId) ?? {
        productId: b.productId,
        name: b.productName,
        projected: 0,
        realised: realised.get(b.productId)?.profit ?? 0,
        soldUnits: realised.get(b.productId)?.units ?? 0,
        units: 0,
        batches: [],
      };
      entry.projected += b.totalProfit;
      entry.units += b.quantity;
      entry.batches.push(b);
      map.set(b.productId, entry);
    }
    return [...map.values()].sort((a, b) =>
      basis === "realised" ? b.realised - a.realised : b.projected - a.projected,
    );
  }, [data, scoped, basis]);

  if (!data || !scoped) return <ProfitSkeleton />;

  const { buckets } = data;
  const { totals } = scoped;
  const empty = data.batches.length === 0;
  // The split runs on whichever basis is selected. Budgeting a share of profit
  // that has not been earned yet is the easy way to overspend, so the two are
  // never merged into one number.
  const splitBase = basis === "realised" ? scoped.realised.profit : totals.profit;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {t("profit.title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3 sm:text-[14px]">{t("profit.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} className="w-full sm:w-auto">
          <Plus size={17} />
          {t("profit.addLot")}
        </Button>
      </div>

      {!empty && (
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeControls range={range} className="w-full sm:w-44" />
          <p className="text-[12.5px] text-ink-3">
            {t("dash.showing")}{" "}
            <span className="font-semibold text-ink-2">{rangeLabel(range, t)}</span>
          </p>
        </div>
      )}

      {empty ? (
        <Card>
          <EmptyState
            icon={<Layers size={24} />}
            title={t("profit.noLots")}
            body="Add a lot with its quantity, buy price and sell price. Profit is worked out for you and divided across your categories."
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                <Plus size={17} />
                {t("profit.addLot")}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="ac-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              hero
              accent="violet"
              label={t("profit.projectedProfit")}
              value={<AnimatedNumber value={totals.profit} format={fmt} />}
              icon={<TrendingUp size={17} />}
              sub={t("profit.projectedHint")}
            />
            <StatTile
              accent="emerald"
              label={t("profit.realisedProfit")}
              value={<AnimatedNumber value={scoped.realised.profit} format={fmt} />}
              icon={<Wallet size={17} />}
              sub={t("profit.realisedHint")}
            />
            <StatTile
              accent="sky"
              label={t("profit.saleValue")}
              value={<AnimatedNumber value={totals.revenue} format={fmt} />}
              icon={<PieChart size={17} />}
              sub={`${fmtPercent(totals.margin)} ${t("dash.margin")}`}
            />
            <StatTile
              accent="amber"
              label={t("profit.stockLots")}
              value={<AnimatedNumber value={totals.lots} format={fmtNum} />}
              icon={<Layers size={17} />}
              sub={`${fmtNum(products.length)} · ${t("nav.products")}`}
            />
          </div>

          <Card>
            <CardHeader
              title={t("profit.split")}
              subtitle={`${fmt(splitBase)} ${t("profit.splitOf")}`}
              action={
                <div
                  className="flex items-center gap-1 rounded-xl border border-line bg-page p-1"
                  role="group"
                  aria-label={t("profit.basis")}
                >
                  {(["projected", "realised"] as Basis[]).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBasis(b)}
                      aria-pressed={basis === b}
                      style={basis === b ? { background: "var(--grad-violet)" } : undefined}
                      className={cx(
                        "h-8 rounded-lg px-3 text-[12px] font-bold transition-all",
                        basis === b ? "text-white" : "text-ink-3 hover:text-ink",
                      )}
                    >
                      {t(b === "projected" ? "profit.projected" : "profit.realised")}
                    </button>
                  ))}
                </div>
              }
            />
            <ul className="flex flex-col gap-2.5 px-4 pb-6 sm:px-6">
              {buckets.map((b, i) => (
                <li
                  key={b.name}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-page px-3.5 py-3 sm:px-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white"
                      style={{ background: BUCKET_ACCENTS[i % BUCKET_ACCENTS.length] }}
                      aria-hidden
                    >
                      {b.percent}%
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-ink sm:text-[14px]">
                        {b.name}
                      </p>
                      <p className="truncate text-[12px] text-ink-3">{b.nameBn}</p>
                    </div>
                  </div>
                  <span className="text-[16px] font-bold tabular-nums text-ink sm:text-[17px]">
                    {fmt(share(splitBase, b.percent))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col gap-4">
            {products.map((product) => {
              const open = expanded === product.productId;
              const headline = basis === "realised" ? product.realised : product.projected;
              return (
                <Card key={product.productId}>
                  <button
                    onClick={() => setExpanded(open ? null : product.productId)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-6 sm:py-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-[14px] font-bold text-white"
                        style={{ background: gradientFor(product.name) }}
                        aria-hidden
                      >
                        {initialOf(product.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold tracking-tight text-ink sm:text-[15px]">
                          {product.name}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-3">
                          {fmtNum(product.batches.length)} {t("profit.lots")} ·{" "}
                          {fmtNum(product.soldUnits)}/{fmtNum(product.units)} {t("profit.sold")}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      <span className="text-[15px] font-bold tabular-nums text-good-ink sm:text-[17px]">
                        {fmt(headline)}
                      </span>
                      <ChevronDown
                        size={17}
                        className={cx(
                          "text-ink-3 transition-transform duration-300 ease-[var(--ease-out)]",
                          open && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </div>
                  </button>

                  {open && (
                    <div className="flex flex-col gap-4 border-t border-line px-4 py-5 sm:px-6">
                      {product.batches.map((batch) => (
                        <BatchCard
                          key={batch.id}
                          batch={batch}
                          buckets={buckets}
                          fmt={fmt}
                          fmtNum={fmtNum}
                          fmtDateFull={fmtDateFull}
                          t={t}
                          onEdit={() => setEditing(batch)}
                          onDelete={() => setDeleting(batch)}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <BatchDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <BatchDialog open={editing !== null} onClose={() => setEditing(null)} batch={editing} />
      <PasscodeConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this stock lot?"
        body={
          deleting
            ? `${deleting.label} of ${deleting.productName}\n${plural(deleting.remaining ?? deleting.quantity, "unit")} still in it come off your stock, and the whole lot off your projected profit.`
            : ""
        }
        onConfirm={async (passcode) => {
          if (!deleting) return;
          await removeBatch({ id: deleting.id as never, passcode });
          toast.ok("Stock lot deleted.");
        }}
      />
    </div>
  );
}

function BatchCard({
  batch,
  buckets,
  fmt,
  fmtNum,
  fmtDateFull,
  t,
  onEdit,
  onDelete,
}: {
  batch: BatchRow;
  buckets: { name: string; nameBn: string; percent: number }[];
  fmt: (n: number) => string;
  fmtNum: (n: number) => string;
  fmtDateFull: (ts: number) => string;
  t: (k: MessageKey) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const loss = batch.totalProfit < 0;
  const tr = t;

  return (
    <div className="rounded-2xl border border-line bg-page p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{batch.label}</Badge>
            <span className="text-[12.5px] text-ink-3">{fmtDateFull(batch.purchasedAt)}</span>
          </div>
          <p className="mt-2 text-[12.5px] leading-5 text-ink-2 sm:text-[13px]">
            {fmtNum(batch.quantity)} {tr("common.units")} · {tr("profit.buyCost")}{" "}
            <span className="font-semibold tabular-nums text-ink">{fmt(batch.unitCost)}</span> ·{" "}
            {tr("sales.unitPrice")}{" "}
            <span className="font-semibold tabular-nums text-ink">
              {batch.unitPrice !== undefined ? fmt(batch.unitPrice) : tr("detail.priceOpen")}
            </span>{" "}
            ·{" "}
            <span
              className={cx(
                "font-semibold tabular-nums",
                loss ? "text-critical-ink" : "text-good-ink",
              )}
            >
              {fmt(batch.unitProfit)}
            </span>{" "}
            / {tr("common.perUnit").toLowerCase()}
          </p>
          {batch.note && <p className="mt-1 text-[12px] text-ink-3">{batch.note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cx(
              "text-[18px] font-bold tabular-nums sm:text-[20px]",
              loss ? "text-critical-ink" : "text-ink",
            )}
          >
            {fmt(batch.totalProfit)}
          </span>
          <button
            onClick={onEdit}
            aria-label="Edit stock lot"
            className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete stock lot"
            className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-critical"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {loss ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-critical-soft px-3.5 py-2.5 text-[12.5px] font-medium text-critical-ink">
          <AlertTriangle size={14} aria-hidden />
          {tr("profit.belowCost")}
        </p>
      ) : (
        <>
          {/* Stacked rows on phones — a four-column table cannot fit 390px. */}
          <ul className="mt-4 flex flex-col gap-1.5 sm:hidden">
            {buckets.map((b) => (
              <li
                key={b.name}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2"
              >
                <span className="min-w-0 truncate text-[12.5px] text-ink-2">
                  <span className="font-bold text-ink-3">{b.percent}%</span> {b.name}
                </span>
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink">
                  {fmt(share(batch.totalProfit, b.percent))}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden sm:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-bold tracking-[0.06em] text-ink-3 uppercase">
                  <th className="py-2 font-bold">{tr("common.category")}</th>
                  <th className="px-3 py-2 text-right font-bold">%</th>
                  <th className="px-3 py-2 text-right font-bold">{tr("common.perUnit")}</th>
                  <th className="py-2 pl-3 text-right font-bold">{tr("common.total")}</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.name} className="border-b border-line last:border-0">
                    <td className="py-2 text-ink-2">
                      {b.name}
                      <span className="block text-[11.5px] text-ink-3">{b.nameBn}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-3">
                      {b.percent}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                      {fmt(share(batch.unitProfit, b.percent))}
                    </td>
                    <td className="py-2 pl-3 text-right font-bold tabular-nums text-ink">
                      {fmt(share(batch.totalProfit, b.percent))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong text-[13px]">
                  <td className="py-2.5 font-bold text-ink-2">{tr("common.total")}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-ink-2">100%</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-ink">
                    {fmt(batch.unitProfit)}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-bold tabular-nums text-good-ink">
                    {fmt(batch.totalProfit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ProfitSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="ac-skeleton h-10 w-48 rounded-xl bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ac-skeleton h-36 rounded-card border border-line bg-surface" />
        ))}
      </div>
      <div className="ac-skeleton h-96 rounded-card border border-line bg-surface" />
    </div>
  );
}
