import { Layers, Package, Receipt, TrendingUp, Wallet } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge, Modal, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor } from "../lib/avatar";
import { useAuthedQuery } from "../lib/session";

/**
 * Everything about one product in one place: stock, its lots, and the sales
 * it has actually produced. Without this, answering "how has this done" meant
 * scanning the whole ledger by eye for one name.
 */
export function ProductDetailDialog({
  open,
  onClose,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  productId: Id<"products"> | null;
}) {
  const { fmt, fmtNum, fmtPercent, fmtDateFull, fmtDateTime } = useSettings();
  const t = useT();
  const data = useAuthedQuery(api.products.detail, productId ? { id: productId } : "skip");

  const name = data?.product.name ?? "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Package size={19} />}
      gradient={name ? gradientFor(name) : undefined}
      title={name || t("detail.title")}
      subtitle={data?.product.category ?? undefined}
      width="sm:max-w-2xl"
    >
      {!data ? (
        <div className="ac-skeleton h-64 bg-surface" aria-hidden />
      ) : (
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={t("sales.profit")}
              value={fmt(data.totals.profit)}
              hint={
                data.totals.revenue > 0 ? `${fmtPercent(data.totals.margin)} ${t("dash.margin")}` : undefined
              }
              icon={<TrendingUp size={14} />}
              tone="good"
            />
            <Stat
              label={t("sales.revenue")}
              value={fmt(data.totals.revenue)}
              hint={`${fmtNum(data.totals.salesCount)} · ${t("nav.sales").toLowerCase()}`}
              icon={<Receipt size={14} />}
            />
            <Stat
              label={t("dash.availableStock")}
              value={`${fmtNum(data.product.quantity)}`}
              hint={`${fmtNum(data.totals.unitsSold)} ${t("detail.unitsSold").toLowerCase()}`}
              icon={<Layers size={14} />}
            />
            <Stat
              label={t("detail.lastPrice")}
              value={data.totals.lastPrice === null ? "—" : fmt(data.totals.lastPrice)}
              hint={
                data.totals.lastSoldAt === null
                  ? t("detail.never")
                  : fmtDateFull(data.totals.lastSoldAt)
              }
              icon={<Wallet size={14} />}
            />
          </div>

          {data.product.details && (
            <div className="rounded-2xl border border-line bg-page p-4">
              <p className="text-[13px] leading-6 whitespace-pre-wrap text-ink-2">
                {data.product.details}
              </p>
            </div>
          )}

          <Section title={t("detail.stockLots")} empty={data.lots.length === 0} emptyText={t("detail.noLots")}>
            <ul className="flex flex-col gap-2">
              {data.lots.map((l) => {
                const unitProfit = l.unitPrice - l.unitCost;
                return (
                  <li
                    key={l._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-page px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone="accent">{l.label}</Badge>
                        <span className="text-[12px] text-ink-3">{fmtDateFull(l.purchasedAt)}</span>
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink-3">
                        {fmtNum(l.quantity)} × {fmt(l.unitCost)} → {fmt(l.unitPrice)}
                      </p>
                    </div>
                    <span
                      className={cx(
                        "text-[14px] font-bold tabular-nums",
                        unitProfit < 0 ? "text-critical-ink" : "text-good-ink",
                      )}
                    >
                      {fmt(unitProfit * l.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section
            title={t("detail.salesHistory")}
            empty={data.sales.length === 0}
            emptyText={t("detail.noSales")}
          >
            <ul className="flex flex-col divide-y divide-line">
              {data.sales.map((s) => {
                const profit = (s.unitPrice - s.unitCost) * s.quantity;
                return (
                  <li key={s._id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] text-ink">{fmtDateTime(s.soldAt)}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">
                        {fmtNum(s.quantity)} × {fmt(s.unitPrice)}
                        {s.buyer ? ` · ${s.buyer}` : ""}
                      </p>
                    </div>
                    <span
                      className={cx(
                        "shrink-0 text-[13.5px] font-bold tabular-nums",
                        profit < 0 ? "text-critical-ink" : "text-good-ink",
                      )}
                    >
                      {profit < 0 ? `−${fmt(Math.abs(profit))}` : `+${fmt(profit)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "good";
}) {
  return (
    <div className="rounded-xl border border-line bg-page px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      <p
        className={cx(
          "mt-1 truncate text-[17px] font-bold tabular-nums",
          tone === "good" ? "text-good-ink" : "text-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  empty,
  emptyText,
  children,
}: {
  title: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
        {title}
      </p>
      {empty ? <p className="text-[13px] text-ink-3">{emptyText}</p> : children}
    </div>
  );
}
