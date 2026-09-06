import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
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

type ArchiveTable = "sales" | "products" | "stockBatches";

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
