import { useMemo, useState } from "react";
import { Hash, Landmark, Plus, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button, Card, EmptyState } from "./ui";
import { StatTile } from "./StatTile";
import { ProductPurchaseDialog } from "./ProductPurchaseDialog";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

/**
 * Stock bought and logged as an investment rather than an operating cost —
 * same underlying lot `BatchDialog` writes, filtered to the ones tagged
 * `investment`. Deleting one here reverses it out of the Investment balance
 * the same way `removeBatch` already reverses stock; see profit.ts.
 */
export function ProductPurchaseCostSection() {
  const { fmt, fmtNum, fmtDateTime } = useSettings();
  const t = useT();
  const toast = useToast();
  const rows = useAuthedQuery(api.profit.purchaseCostBatches, {});
  const remove = useAuthedMutation(api.profit.removeBatch);

  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Doc<"stockBatches"> | null>(null);

  const total = useMemo(() => (rows ?? []).reduce((sum, r) => sum + r.quantity * r.unitCost, 0), [rows]);

  return (
    <>
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus size={17} />
          {t("investment.add")}
        </Button>
      </div>

      <div className="ac-stagger grid gap-4 sm:grid-cols-2">
        <StatTile
          hero
          accent="amber"
          label={t("investment.totalLogged")}
          value={fmt(total)}
          icon={<Landmark size={17} />}
        />
        <StatTile
          accent="violet"
          label={t("costs.entries")}
          value={fmtNum((rows ?? []).length)}
          icon={<Hash size={17} />}
        />
      </div>

      <Card>
        {rows === undefined ? (
          <div className="ac-skeleton h-72 rounded-card bg-surface" aria-hidden />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Landmark size={24} />}
            title={t("investment.none")}
            body={t("investment.noneBody")}
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                <Plus size={17} />
                {t("investment.add")}
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((r) => (
              <li key={r._id} className="flex items-start gap-3 px-4 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{r.productName}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {fmtDateTime(r.purchasedAt)} · {fmtNum(r.quantity)} × {fmt(r.unitCost)}
                  </p>
                  {r.note && <p className="mt-1 text-[12.5px] text-ink-3">{r.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[14px] font-bold tabular-nums text-ink">
                    {fmt(r.quantity * r.unitCost)}
                  </span>
                  <button
                    onClick={() => setDeleting(r)}
                    aria-label={`${t("common.delete")} ${r.productName}`}
                    className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ProductPurchaseDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <PasscodeConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("investment.deleteTitle")}
        body={
          deleting
            ? `${deleting.productName} — ${fmt(deleting.quantity * deleting.unitCost)} comes off Investment, and its stock comes off the product.`
            : ""
        }
        onConfirm={async (passcode) => {
          if (!deleting) return;
          await remove({ id: deleting._id, passcode });
          toast.ok(t("investment.deleted"));
        }}
      />
    </>
  );
}
