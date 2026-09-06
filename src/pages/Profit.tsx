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
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge, Button, Card, CardHeader, EmptyState, cx } from "../components/ui";
import { StatTile } from "../components/StatTile";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { BatchDialog, type BatchRow } from "../components/BatchDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSettings } from "../lib/settings";
import { gradientFor, initialOf } from "../lib/avatar";
import { formatDateFull, percent, plural } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
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

export function ProfitPage() {
  const { fmt } = useSettings();
  const toast = useToast();
  const data = useAuthedQuery(api.profit.summary);
  const removeBatch = useAuthedMutation(api.profit.removeBatch);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<BatchRow | null>(null);
  const [deleting, setDeleting] = useState<BatchRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Group lots under their product, newest lot first within each.
  const products = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { productId: string; name: string; profit: number; units: number; batches: typeof data.batches }
    >();
    for (const b of data.batches) {
      const entry = map.get(b.productId) ?? {
        productId: b.productId,
        name: b.productName,
        profit: 0,
        units: 0,
        batches: [],
      };
      entry.profit += b.totalProfit;
      entry.units += b.quantity;
      entry.batches.push(b);
      map.set(b.productId, entry);
    }
    return [...map.values()].sort((a, b) => b.profit - a.profit);
  }, [data]);

  if (!data) return <ProfitSkeleton />;

  const { buckets, totals } = data;
  const empty = data.batches.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-ink">Profit</h1>
          <p className="mt-1 text-[14px] text-ink-3">
            Profit per stock lot, split across your categories.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus size={17} />
          Add stock lot
        </Button>
      </div>

      {empty ? (
        <Card>
          <EmptyState
            icon={<Layers size={24} />}
            title="No stock lots yet"
            body="Add a lot with its quantity, buy price and sell price. Profit is worked out for you and divided across your categories."
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                <Plus size={17} />
                Add stock lot
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
              label="Total profit"
              value={<AnimatedNumber value={totals.profit} format={fmt} />}
              icon={<TrendingUp size={17} />}
              sub={`${percent(totals.margin)} margin`}
            />
            <StatTile
              accent="sky"
              label="Sale value"
              value={<AnimatedNumber value={totals.revenue} format={fmt} />}
              icon={<PieChart size={17} />}
              sub="All lots at their sell price"
            />
            <StatTile
              accent="amber"
              label="Buy cost"
              value={<AnimatedNumber value={totals.cost} format={fmt} />}
              icon={<Layers size={17} />}
              sub="What the lots cost you"
            />
            <StatTile
              accent="emerald"
              label="Stock lots"
              value={<AnimatedNumber value={totals.lots} format={(n) => n.toLocaleString()} />}
              icon={<Layers size={17} />}
              sub={plural(products.length, "product")}
            />
          </div>

          {/* The split of total profit — the point of the whole page. */}
          <Card>
            <CardHeader
              title="Profit split"
              subtitle={`Total profit of ${fmt(totals.profit)} treated as 100%`}
            />
            <ul className="flex flex-col gap-2.5 px-6 pb-6">
              {buckets.map((b, i) => {
                const amount = share(totals.profit, b.percent);
                return (
                  <li
                    key={b.name}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-page px-4 py-3"
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
                        <p className="truncate text-[14px] font-semibold text-ink">{b.name}</p>
                        <p className="truncate text-[12px] text-ink-3">{b.nameBn}</p>
                      </div>
                    </div>
                    <span className="text-[17px] font-bold tabular-nums text-ink">
                      {fmt(amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Per product, expandable to its individual lots. */}
          <div className="flex flex-col gap-4">
            {products.map((product) => {
              const open = expanded === product.productId;
              return (
                <Card key={product.productId}>
                  <button
                    onClick={() => setExpanded(open ? null : product.productId)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
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
                        <p className="truncate text-[15px] font-bold tracking-tight text-ink">
                          {product.name}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-ink-3">
                          {plural(product.batches.length, "lot")} ·{" "}
                          {plural(product.units, "unit")}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-[17px] font-bold tabular-nums text-good-ink">
                        {fmt(product.profit)}
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
                    <div className="border-t border-line px-6 py-5">
                      <div className="flex flex-col gap-4">
                        {product.batches.map((batch) => (
                          <BatchCard
                            key={batch.id}
                            batch={batch}
                            buckets={buckets}
                            fmt={fmt}
                            onEdit={() => setEditing(batch)}
                            onDelete={() => setDeleting(batch)}
                          />
                        ))}
                      </div>
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
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this stock lot?"
        body={
          deleting
            ? `${deleting.label} of ${deleting.productName} — ${plural(deleting.quantity, "unit")} — comes off your profit split.`
            : ""
        }
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await removeBatch({ id: deleting.id as never });
            toast.ok("Stock lot deleted.");
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}

function BatchCard({
  batch,
  buckets,
  fmt,
  onEdit,
  onDelete,
}: {
  batch: BatchRow;
  buckets: { name: string; nameBn: string; percent: number }[];
  fmt: (n: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const loss = batch.totalProfit < 0;

  return (
    <div className="rounded-2xl border border-line bg-page p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="accent">{batch.label}</Badge>
            <span className="text-[12.5px] text-ink-3">{formatDateFull(batch.purchasedAt)}</span>
          </div>
          <p className="mt-2 text-[13px] text-ink-2">
            {plural(batch.quantity, "unit")} · buy{" "}
            <span className="font-semibold tabular-nums text-ink">{fmt(batch.unitCost)}</span> ·
            sell{" "}
            <span className="font-semibold tabular-nums text-ink">{fmt(batch.unitPrice)}</span> ·
            profit{" "}
            <span
              className={cx(
                "font-semibold tabular-nums",
                loss ? "text-critical-ink" : "text-good-ink",
              )}
            >
              {fmt(batch.unitProfit)}
            </span>{" "}
            each
          </p>
          {batch.note && <p className="mt-1 text-[12px] text-ink-3">{batch.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cx(
              "text-[20px] font-bold tabular-nums",
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
          This lot sells below cost, so there is no profit to split.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-bold tracking-[0.06em] text-ink-3 uppercase">
                <th className="py-2 font-bold">Category</th>
                <th className="px-3 py-2 text-right font-bold">%</th>
                <th className="px-3 py-2 text-right font-bold">Per unit</th>
                <th className="py-2 pl-3 text-right font-bold">Total</th>
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
                <td className="py-2.5 font-bold text-ink-2">Total</td>
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
