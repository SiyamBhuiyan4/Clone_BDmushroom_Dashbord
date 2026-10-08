import { query, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireSession } from "./auth";

/*
  Investment is a single running balance, not a ledger of its own — every
  change to it is a side effect of something that already has its own record
  (a stock purchase logged as a cost, a sale). `counters` already exists for
  exactly this shape of thing (see `nextOrderNo` in orders.ts), so this reuses
  it under the name "investment" rather than adding a one-row table.

  It starts at zero and is never backfilled automatically: stock bought before
  this existed was never added to it, so the shopkeeper sets the true starting
  number by hand once, the same way any ledger starts from a known balance.
*/
const COUNTER_NAME = "investment";

export async function adjustInvestment(ctx: MutationCtx, delta: number) {
  if (delta === 0) return;
  const row = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
    .unique();
  const next = (row?.value ?? 0) + delta;
  if (row) await ctx.db.patch(row._id, { value: next });
  else await ctx.db.insert("counters", { name: COUNTER_NAME, value: next });
}

export const current = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
      .unique();
    return row?.value ?? 0;
  },
});

/*
  One-time correction, run by hand from the CLI
  (`npx convex run investment:recalculate`), never from the app itself.

  Day to day, the balance is kept by `adjustInvestment` calls scattered across
  every place stock moves — which only stays right if every one of those call
  sites was already wired up correctly. This instead throws that history away
  and prices what is on the shelf *right now*, straight from each product's
  own quantity and cost — the same ground truth the Products page already
  shows — so it also corrects for stock that changed through a path nothing
  here ever taught to touch Investment.
*/
export const recalculate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let total = 0;
    for (const p of products) {
      if (!p.variants?.length) {
        total += p.quantity * p.costPrice;
      } else if (p.stockMode === "separate") {
        for (const v of p.variants) total += (v.quantity ?? 0) * v.costPrice;
      } else {
        // A shared pool has no price of its own — each size prices its own
        // package, not the pool unit. Valuing it at the cheapest rate on
        // record means an approximation this can't get exactly right errs
        // low rather than overstating what is actually invested.
        const perUnit = Math.min(...p.variants.map((v) => v.costPrice / (v.baseQuantity ?? 1)));
        total += p.quantity * perUnit;
      }
    }
    const row = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
      .unique();
    if (row) await ctx.db.patch(row._id, { value: total });
    else await ctx.db.insert("counters", { name: COUNTER_NAME, value: total });
    return total;
  },
});
