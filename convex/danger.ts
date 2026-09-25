import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireSession, verifyPasscode } from "./auth";

/*
  Erase actions.

  Everything removed here is copied into `archive` first. Nothing in the app
  reads that table and the interface offers no undo — the copy exists so a
  mistake is recoverable from the CLI by whoever holds the Convex admin
  credentials, which in practice is only the person running the deployment.

  Both actions re-check the passcode. A live session is not enough: the point
  of a confirmation step is that it cannot be reached by a browser someone
  walked past.
*/

type ArchiveTable = "sales" | "products" | "stockBatches" | "orders" | "costs";

async function archiveDoc(
  ctx: MutationCtx,
  table: ArchiveTable,
  doc: Record<string, unknown> & { _id: unknown },
  batchId: string,
  reason: string,
) {
  await ctx.db.insert("archive", {
    table,
    originalId: String(doc._id),
    data: doc,
    archivedAt: Date.now(),
    batchId,
    reason,
  });
}

function newBatchId() {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What an erase would remove, so the dialog can state a real number. */
export const previewRange = query({
  args: { token: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_soldAt", (q) => q.gte("soldAt", args.from).lte("soldAt", args.to))
      .collect();

    let revenue = 0;
    let profit = 0;
    for (const s of sales) {
      revenue += s.unitPrice * s.quantity;
      profit += (s.unitPrice - s.unitCost) * s.quantity;
    }
    return { count: sales.length, revenue, profit };
  },
});

export const previewAll = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const [sales, products, lots] = await Promise.all([
      ctx.db.query("sales").collect(),
      ctx.db.query("products").collect(),
      ctx.db.query("stockBatches").collect(),
    ]);
    return { sales: sales.length, products: products.length, lots: lots.length };
  },
});

/**
 * Removes every sale whose date falls in the range. Deliberately date-only —
 * the search box is not applied, so what gets erased is exactly what the
 * dialog says, not whatever happened to be filtered on screen.
 *
 * Stock is intentionally NOT returned to products here. This is for clearing
 * out an old period, not for reversing individual sales; putting units back
 * would silently inflate current inventory.
 */
export const eraseRange = mutation({
  args: { token: v.string(), passcode: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    if (args.to < args.from) throw new ConvexError("The end date is before the start date.");

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_soldAt", (q) => q.gte("soldAt", args.from).lte("soldAt", args.to))
      .collect();
    if (sales.length === 0) throw new ConvexError("There are no sales in that range.");

    const batchId = newBatchId();
    for (const s of sales) {
      await archiveDoc(ctx, "sales", s, batchId, "eraseRange");
      await ctx.db.delete(s._id);
    }
    return { batchId, removed: sales.length };
  },
});

/** Removes every sale, product and stock lot. The passcode itself is kept. */
export const eraseAll = mutation({
  args: { token: v.string(), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);

    const batchId = newBatchId();
    let removed = 0;

    for (const s of await ctx.db.query("sales").collect()) {
      await archiveDoc(ctx, "sales", s, batchId, "eraseAll");
      await ctx.db.delete(s._id);
      removed++;
    }
    for (const b of await ctx.db.query("stockBatches").collect()) {
      await archiveDoc(ctx, "stockBatches", b, batchId, "eraseAll");
      await ctx.db.delete(b._id);
      removed++;
    }
    for (const p of await ctx.db.query("products").collect()) {
      await archiveDoc(ctx, "products", p, batchId, "eraseAll");
      await ctx.db.delete(p._id);
      removed++;
    }
    return { batchId, removed };
  },
});

/* --------------------------------------------------------- range reset */

/*
  Resetting a period.

  `eraseRange` above clears sales and nothing else, which is enough to zero
  the dashboard and not enough to start a month again — the orders that wrote
  those sales, the costs recorded against them and the lots bought in the
  period all survive it. This pair lets the range be chosen and each kind of
  record ticked, so what goes is what was asked for rather than a fixed set.

  Blank bounds mean open-ended, matching the date control on every page: a
  reset with neither end set is a reset of everything dated.
*/

type ResetKinds = {
  sales: boolean;
  orders: boolean;
  costs: boolean;
  lots: boolean;
};

/** What a reset would take, per kind, so each tickbox can state a real figure. */
export const previewReset = query({
  args: { token: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const [sales, orders, costs, lots] = await Promise.all([
      ctx.db
        .query("sales")
        .withIndex("by_soldAt", (q) => q.gte("soldAt", args.from).lte("soldAt", args.to))
        .collect(),
      ctx.db
        .query("orders")
        .withIndex("by_orderedAt", (q) => q.gte("orderedAt", args.from).lte("orderedAt", args.to))
        .collect(),
      ctx.db
        .query("costs")
        .withIndex("by_spentAt", (q) => q.gte("spentAt", args.from).lte("spentAt", args.to))
        .collect(),
      ctx.db
        .query("stockBatches")
        .withIndex("by_purchasedAt", (q) =>
          q.gte("purchasedAt", args.from).lte("purchasedAt", args.to),
        )
        .collect(),
    ]);

    let revenue = 0;
    let profit = 0;
    let unitsSold = 0;
    for (const s of sales) {
      revenue += s.unitPrice * s.quantity;
      profit += (s.unitPrice - s.unitCost) * s.quantity;
      unitsSold += s.quantity;
    }

    let costAmount = 0;
    for (const c of costs) costAmount += c.amount;

    let orderTotal = 0;
    for (const o of orders) orderTotal += o.total;

    /*
      Lots are counted by what is still in them. The units already sold out of
      a lot left stock when they sold, so quoting the size it was bought at
      would overstate what this reset actually takes off the shelf.
    */
    let lotUnits = 0;
    let lotCost = 0;
    for (const l of lots) {
      const left = l.remaining ?? l.quantity;
      lotUnits += left;
      lotCost += left * l.unitCost;
    }

    return {
      sales: { count: sales.length, revenue, profit, units: unitsSold },
      orders: { count: orders.length, total: orderTotal },
      costs: { count: costs.length, amount: costAmount },
      lots: { count: lots.length, units: lotUnits, cost: lotCost },
    };
  },
});

/**
 * Clears the ticked kinds of record inside a date range.
 *
 * Order matters. Sales are put back first when `restoreStock` is on, then
 * lots are taken away — a unit returned to a lot that is itself being erased
 * must not survive the reset, and doing it the other way round would leave it
 * on the shelf.
 *
 * `restoreStock` is a choice because both answers are right for different
 * jobs. Re-entering a period needs the units back, or the re-entered sales
 * take them off a second time. Writing off a closed period does not, and
 * returning them would inflate today's inventory. The caller says which.
 */
export const resetRange = mutation({
  args: {
    token: v.string(),
    passcode: v.string(),
    from: v.number(),
    to: v.number(),
    sales: v.boolean(),
    orders: v.boolean(),
    costs: v.boolean(),
    lots: v.boolean(),
    restoreStock: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    if (args.to < args.from) throw new ConvexError("The end date is before the start date.");

    const kinds: ResetKinds = {
      sales: args.sales,
      orders: args.orders,
      costs: args.costs,
      lots: args.lots,
    };
    if (!kinds.sales && !kinds.orders && !kinds.costs && !kinds.lots) {
      throw new ConvexError("Tick at least one kind of record to reset.");
    }

    const batchId = newBatchId();
    const removed = { sales: 0, orders: 0, costs: 0, lots: 0 };

    /*
      Sales reached two ways — dated in the range, or written by an order that
      is being erased — are the same rows, so they are gathered before
      anything is deleted. Deleting one twice would return its units twice.
    */
    const doomedSales = new Map<string, Doc<"sales">>();

    const orderRows = kinds.orders
      ? await ctx.db
          .query("orders")
          .withIndex("by_orderedAt", (q) =>
            q.gte("orderedAt", args.from).lte("orderedAt", args.to),
          )
          .collect()
      : [];

    if (kinds.sales) {
      const rows = await ctx.db
        .query("sales")
        .withIndex("by_soldAt", (q) => q.gte("soldAt", args.from).lte("soldAt", args.to))
        .collect();
      for (const s of rows) doomedSales.set(String(s._id), s);
    }
    // An order's ledger lines exist because of the order. Erasing the order
    // and leaving them behind would keep its revenue on every page.
    for (const o of orderRows) {
      for (const saleId of o.saleIds ?? []) {
        const sale = await ctx.db.get(saleId);
        if (sale) doomedSales.set(String(sale._id), sale);
      }
    }

    for (const sale of doomedSales.values()) {
      if (args.restoreStock) {
        const product = await ctx.db.get(sale.productId);
        if (product) {
          await ctx.db.patch(sale.productId, { quantity: product.quantity + sale.quantity });
        }
        // Back to the lot it was drawn from, not just to the shelf total.
        if (sale.batchId) {
          const batch = await ctx.db.get(sale.batchId);
          if (batch) {
            const left = batch.remaining ?? batch.quantity;
            await ctx.db.patch(sale.batchId, {
              remaining: Math.min(batch.quantity, left + sale.quantity),
            });
          }
        }
      }
      await archiveDoc(ctx, "sales", sale, batchId, "resetRange");
      await ctx.db.delete(sale._id);
      removed.sales++;
    }

    for (const o of orderRows) {
      await archiveDoc(ctx, "orders", o, batchId, "resetRange");
      await ctx.db.delete(o._id);
      removed.orders++;
    }

    if (kinds.costs) {
      const rows = await ctx.db
        .query("costs")
        .withIndex("by_spentAt", (q) => q.gte("spentAt", args.from).lte("spentAt", args.to))
        .collect();
      for (const c of rows) {
        // The name's usage count follows the ledger down, as it does on a
        // single delete — otherwise a reset leaves dead names ranked top.
        if (c.costNameId) {
          const nameRow = await ctx.db.get(c.costNameId);
          if (nameRow) {
            await ctx.db.patch(c.costNameId, {
              usageCount: Math.max(0, nameRow.usageCount - 1),
            });
          }
        }
        await archiveDoc(ctx, "costs", c, batchId, "resetRange");
        await ctx.db.delete(c._id);
        removed.costs++;
      }
    }

    if (kinds.lots) {
      const rows = await ctx.db
        .query("stockBatches")
        .withIndex("by_purchasedAt", (q) =>
          q.gte("purchasedAt", args.from).lte("purchasedAt", args.to),
        )
        .collect();
      for (const l of rows) {
        const product = await ctx.db.get(l.productId);
        if (product) {
          // Only what is left in the lot, for the same reason removeBatch
          // takes only that: the sold units already came off stock.
          const left = l.remaining ?? l.quantity;
          await ctx.db.patch(l.productId, {
            quantity: Math.max(0, product.quantity - left),
          });
        }
        await archiveDoc(ctx, "stockBatches", l, batchId, "resetRange");
        await ctx.db.delete(l._id);
        removed.lots++;
      }
    }

    const total = removed.sales + removed.orders + removed.costs + removed.lots;
    if (total === 0) throw new ConvexError("Nothing in that range matches what you ticked.");

    return { batchId, removed, total };
  },
});

/* ------------------------------------------------------- recovery (CLI) */

/**
 * Lists archived erases, newest first:
 *
 *   npx convex run danger:archiveList
 *   npx convex run --prod danger:archiveList
 */
export const archiveList = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("archive").withIndex("by_archivedAt").order("desc").take(2000);
    const batches = new Map<
      string,
      { batchId: string; reason: string; archivedAt: number; counts: Record<string, number> }
    >();
    for (const r of rows) {
      const entry = batches.get(r.batchId) ?? {
        batchId: r.batchId,
        reason: r.reason,
        archivedAt: r.archivedAt,
        counts: {},
      };
      entry.counts[r.table] = (entry.counts[r.table] ?? 0) + 1;
      entry.archivedAt = Math.max(entry.archivedAt, r.archivedAt);
      batches.set(r.batchId, entry);
    }
    return [...batches.values()].sort((a, b) => b.archivedAt - a.archivedAt);
  },
});

/**
 * Puts one archived erase back:
 *
 *   npx convex run danger:archiveRestore '{"batchId":"…"}'
 *
 * Rows are reinserted with new ids. Sales reference their original product id,
 * so restoring sales without the products they belonged to leaves them
 * pointing at nothing — restore the batch that contains both, or expect the
 * product column to fall back to the snapshotted name.
 */
export const archiveRestore = internalMutation({
  args: { batchId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("archive")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();
    if (rows.length === 0) throw new ConvexError("No archive found with that batch id.");

    const restored: Record<string, number> = {};
    for (const r of rows) {
      const doc = { ...(r.data as Record<string, unknown>) };
      delete doc._id;
      delete doc._creationTime;
      await ctx.db.insert(r.table as ArchiveTable, doc as never);
      restored[r.table] = (restored[r.table] ?? 0) + 1;
      await ctx.db.delete(r._id);
    }
    return `Restored ${JSON.stringify(restored)} from batch ${args.batchId}.`;
  },
});

/** Permanently drops an archived batch. This one really is unrecoverable. */
export const archivePurge = internalMutation({
  args: { batchId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("archive")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return `Purged ${rows.length} archived row(s) from batch ${args.batchId}.`;
  },
});
