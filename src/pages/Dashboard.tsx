import { useMemo, useState } from "react";
import {
  Boxes,
  CircleDollarSign,
  Package,
  PackagePlus,
  Plus,
  Receipt,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge, Button, Card, CardAction, CardHeader, EmptyState, cx } from "../components/ui";
import { StatTile, type Delta } from "../components/StatTile";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { TrendChart, type TrendPoint } from "../components/charts/TrendChart";
import { TopProductsChart, type TopProduct } from "../components/charts/TopProductsChart";
import { ProductDialog } from "../components/ProductDialog";
import { SellDialog } from "../components/SellDialog";
import { useSettings } from "../lib/settings";
import { gradientFor, initialOf } from "../lib/avatar";
import { percent, plural, relativeTime, startOfLocalDay } from "../lib/format";
import { useAuthedQuery } from "../lib/session";

const DAY = 24 * 60 * 60 * 1000;
const RANGES = [
  { days: 7, label: "7D", full: "last 7 days", prev: "previous 7 days" },
  { days: 30, label: "30D", full: "last 30 days", prev: "previous 30 days" },
  { days: 90, label: "90D", full: "last 90 days", prev: "previous 90 days" },
  { days: 365, label: "12M", full: "last 12 months", prev: "previous 12 months" },
];

/** Change as a fraction. Null when the baseline is zero — there is no "% of nothing". */
function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function DashboardPage({ onNavigate }: { onNavigate: (r: "products" | "sales") => void }) {
  const { fmt } = useSettings();
  const data = useAuthedQuery(api.dashboard.overview);
  const [rangeDays, setRangeDays] = useState(30);
  const [sellOpen, setSellOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);

  const range = RANGES.find((r) => r.days === rangeDays)!;

  const scoped = useMemo(() => {
    if (!data) return null;
    const since = startOfLocalDay(Date.now() - (rangeDays - 1) * DAY);
    const prevSince = since - rangeDays * DAY;

    const rows = data.windowSales.filter((s) => s.soldAt >= since);
    // The immediately preceding window of the same length, for the deltas.
    const prevRows = data.windowSales.filter((s) => s.soldAt >= prevSince && s.soldAt < since);

    let revenue = 0;
    let profit = 0;
    let units = 0;
    const byDay = new Map<number, { revenue: number; profit: number }>();
    const byProduct = new Map<string, TopProduct>();

    for (const s of rows) {
      revenue += s.revenue;
      profit += s.profit;
      units += s.units;

      const day = startOfLocalDay(s.soldAt);
      const bucket = byDay.get(day) ?? { revenue: 0, profit: 0 };
      bucket.revenue += s.revenue;
      bucket.profit += s.profit;
      byDay.set(day, bucket);

      const agg =
        byProduct.get(s.productId) ??
        ({ productId: s.productId, name: s.productName, revenue: 0, profit: 0, units: 0 } satisfies TopProduct);
      agg.revenue += s.revenue;
      agg.profit += s.profit;
      agg.units += s.units;
      byProduct.set(s.productId, agg);
    }

    let prevRevenue = 0;
    let prevProfit = 0;
    for (const s of prevRows) {
      prevRevenue += s.revenue;
      prevProfit += s.profit;
    }

    // Fill every day in the range so the line stays continuous through days
    // with no sales instead of skipping over them.
    const points: TrendPoint[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const ts = startOfLocalDay(Date.now() - i * DAY);
      const bucket = byDay.get(ts);
      points.push({ ts, revenue: bucket?.revenue ?? 0, profit: bucket?.profit ?? 0 });
    }

    return {
      revenue,
      profit,
      units,
      count: rows.length,
      margin: revenue > 0 ? profit / revenue : 0,
      averageSale: rows.length > 0 ? revenue / rows.length : 0,
      deltaProfit: change(profit, prevProfit),
      deltaRevenue: change(revenue, prevRevenue),
      deltaCount: change(rows.length, prevRows.length),
      points,
      topProducts: [...byProduct.values()].sort((a, b) => b.profit - a.profit).slice(0, 6),
    };
  }, [data, rangeDays]);

  if (!data || !scoped) return <DashboardSkeleton />;

  const { inventory, allTime, recentSales } = data;
  const blank = allTime.salesCount === 0 && inventory.productCount === 0;
  const vs = (fraction: number | null): Delta => ({ fraction, label: `vs ${range.prev}` });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-1 text-[14px] text-ink-3">Profit, sales and stock at a glance.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" onClick={() => setProductOpen(true)}>
            <PackagePlus size={17} />
            Add product
          </Button>
          <Button
            variant="primary"
            onClick={() => setSellOpen(true)}
            disabled={inventory.inStockCount === 0}
            title={inventory.inStockCount === 0 ? "Add a product with stock first" : undefined}
          >
            <Plus size={17} />
            Record sale
          </Button>
        </div>
      </div>

      {blank ? (
        <Card>
          <EmptyState
            icon={<Package size={24} />}
            title="Nothing here yet"
            body="Add your first product with a cost price, then record a sale for it. Profit, revenue and stock all follow from those two things."
            action={
              <Button variant="primary" onClick={() => setProductOpen(true)}>
                <PackagePlus size={17} />
                Add your first product
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* One filter row, above everything it scopes. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13.5px] text-ink-3">
              Showing the <span className="font-semibold text-ink-2">{range.full}</span>
            </p>
            <div
              className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-sm)]"
              role="group"
              aria-label="Date range"
            >
              {RANGES.map((r) => {
                const active = rangeDays === r.days;
                return (
                  <button
                    key={r.days}
                    onClick={() => setRangeDays(r.days)}
                    aria-pressed={active}
                    style={active ? { background: "var(--grad-violet)" } : undefined}
                    className={cx(
                      "h-8 rounded-lg px-3.5 text-[12.5px] font-bold tracking-wide transition-all",
                      active ? "text-white" : "text-ink-3 hover:text-ink",
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ac-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              hero
              accent="violet"
              label="Profit"
              value={
                <AnimatedNumber
                  value={scoped.profit}
                  format={(n) => (n < 0 ? `−${fmt(Math.abs(n))}` : fmt(n))}
                />
              }
              icon={<TrendingUp size={17} />}
              delta={vs(scoped.deltaProfit)}
              sub={scoped.revenue > 0 ? `${percent(scoped.margin)} margin` : undefined}
            />
            <StatTile
              accent="sky"
              label="Revenue"
              value={<AnimatedNumber value={scoped.revenue} format={fmt} />}
              icon={<CircleDollarSign size={17} />}
              delta={vs(scoped.deltaRevenue)}
              sub={`${fmt(allTime.revenue)} all time`}
            />
            <StatTile
              accent="amber"
              label="Sales"
              value={<AnimatedNumber value={scoped.count} format={(n) => n.toLocaleString()} />}
              icon={<Receipt size={17} />}
              delta={vs(scoped.deltaCount)}
              sub={scoped.count > 0 ? `${fmt(scoped.averageSale)} avg` : "No sales yet"}
            />
            <StatTile
              accent="emerald"
              label="Available stock"
              value={
                <AnimatedNumber
                  value={inventory.unitsInStock}
                  format={(n) => `${n.toLocaleString()} units`}
                />
              }
              icon={<Boxes size={17} />}
              sub={`${plural(inventory.inStockCount, "product")} · ${fmt(inventory.inventoryCost)} at cost`}
            />
          </div>

          <div className="ac-stagger grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Revenue and profit" subtitle={`Per day, ${range.full}`} />
              <TrendChart points={scoped.points} />
            </Card>

            <Card>
              <CardHeader title="Top products" subtitle={`By profit, ${range.full}`} />
              {scoped.topProducts.length === 0 ? (
                <EmptyState
                  icon={<Receipt size={22} />}
                  title="No sales yet"
                  body="Record a sale and your best earners rank here."
                />
              ) : (
                <TopProductsChart items={scoped.topProducts} />
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent sales"
                subtitle="Latest activity"
                action={<CardAction onClick={() => onNavigate("sales")}>View all</CardAction>}
              />
              {recentSales.length === 0 ? (
                <EmptyState
                  icon={<Receipt size={22} />}
                  title="No sales recorded"
                  body="When you sell something, it shows up here with its profit."
                />
              ) : (
                <ul className="flex flex-col gap-1 px-4 pb-4">
                  {recentSales.map((s) => {
                    const profit = (s.unitPrice - s.unitCost) * s.quantity;
                    return (
                      <li
                        key={s._id}
                        className="flex items-center justify-between gap-4 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
                            style={{ background: gradientFor(s.productName) }}
                            aria-hidden
                          >
                            {initialOf(s.productName)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-ink">
                              {s.productName}
                            </p>
                            <p className="mt-0.5 text-[12px] text-ink-3">
                              {relativeTime(s.soldAt)}
                              {s.quantity > 1 && ` · ${s.quantity} units`}
                              {s.buyer && ` · ${s.buyer}`}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[14px] font-bold tabular-nums text-ink">
                            {fmt(s.unitPrice * s.quantity)}
                          </p>
                          <p
                            className={cx(
                              "mt-0.5 text-[12px] font-semibold tabular-nums",
                              profit < 0 ? "text-critical-ink" : "text-good-ink",
                            )}
                          >
                            {profit < 0 ? `−${fmt(Math.abs(profit))}` : `+${fmt(profit)}`}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="self-start">
              <CardHeader
                title="Inventory"
                subtitle={plural(inventory.productCount, "active product")}
                action={<CardAction onClick={() => onNavigate("products")}>Manage</CardAction>}
              />
              <div className="px-6 pb-6">
                <dl className="grid grid-cols-2 gap-3">
                  <MiniStat label="In stock" value={String(inventory.inStockCount)} />
                  <MiniStat
                    label="Out of stock"
                    value={String(inventory.outOfStockCount)}
                    alarm={inventory.outOfStockCount > 0}
                  />
                </dl>

                {inventory.lowStock.length > 0 ? (
                  <div className="mt-5">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink-2">
                      <AlertTriangle size={14} className="text-warning" aria-hidden />
                      Running low
                    </p>
                    <ul className="mt-2.5 flex flex-col gap-2">
                      {inventory.lowStock.map((p) => (
                        <li key={p._id} className="flex items-center justify-between gap-3">
                          <span className="truncate text-[13.5px] text-ink-2">{p.name}</span>
                          <Badge tone="warning">{p.quantity} left</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  inventory.outOfStockCount === 0 && (
                    <p className="mt-5 text-[13px] leading-6 text-ink-3">
                      Every product has stock on hand. Nothing needs restocking.
                    </p>
                  )
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      <ProductDialog open={productOpen} onClose={() => setProductOpen(false)} />
      <SellDialog open={sellOpen} onClose={() => setSellOpen(false)} />
    </div>
  );
}

function MiniStat({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-page px-3.5 py-3">
      <dt className="text-[12px] font-medium text-ink-3">{label}</dt>
      <dd
        className={cx(
          "mt-0.5 text-[20px] leading-7 font-bold tracking-tight",
          alarm ? "text-critical-ink" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="ac-skeleton h-10 w-56 rounded-xl bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ac-skeleton h-36 rounded-card border border-line bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="ac-skeleton h-80 rounded-card border border-line bg-surface lg:col-span-2" />
        <div className="ac-skeleton h-80 rounded-card border border-line bg-surface" />
      </div>
    </div>
  );
}
