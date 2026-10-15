import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession } from "./auth";

/*
  The sales ledger is read-only from here. Every sale is written by an order
  (orders.ts), which is what draws its units out of a lot — a sale written
  any other way would move stock no lot knows about.
*/

export const list = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const q = ctx.db.query("sales").withIndex("by_soldAt").order("desc");
    return args.limit ? await q.take(args.limit) : await q.collect();
  },
});
