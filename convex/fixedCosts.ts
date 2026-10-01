import { mutation, query, type QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireSession, verifyPasscode } from "./auth";

/*
  Fixed costs — the bills that recur every month rather than happen as they
  come up. Unlike `costs` (logged the moment money goes out, searched by
  date range), a fixed cost is booked once per calendar month against a
  small, named set of folders: office rent, utility bill, wifi bill, staff
  salary, and anything else the shop adds. Browsing is by month, not range,
  because "how much was October's rent" is the question, not "costs between
  these two dates."
*/

const STARTER_CATEGORIES = ["Office Rent", "Utility Bill", "Wifi Bill", "Staff Salary"];

function keyOf(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The first instant of a "YYYY-MM" month, in local time. */
function monthStart(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).getTime();
}

export const listCategories = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const rows = await ctx.db.query("fixedCostCategories").collect();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const addCategory = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const name = args.name.trim();
    if (!name) throw new ConvexError("A category needs a name.");
    const key = keyOf(name);
    const clash = await ctx.db
      .query("fixedCostCategories")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (clash) throw new ConvexError(`"${clash.name}" already exists.`);
    return await ctx.db.insert("fixedCostCategories", { name, key, createdAt: Date.now() });
  },
});

export const renameCategory = mutation({
  args: { token: v.string(), id: v.id("fixedCostCategories"), name: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const name = args.name.trim();
    if (!name) throw new ConvexError("A category needs a name.");
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That category no longer exists.");
    const key = keyOf(name);
    if (key !== row.key) {
      const clash = await ctx.db
        .query("fixedCostCategories")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (clash) throw new ConvexError(`"${clash.name}" already exists.`);
    }
    // Months already booked under this category keep their own snapshot
    // name — a rename here is forward-looking only, same as a cost name's.
    await ctx.db.patch(args.id, { name, key });
  },
});

/** Drops a category and every month's amount booked against it. */
export const removeCategory = mutation({
  args: { token: v.string(), id: v.id("fixedCostCategories"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const rows = await ctx.db
      .query("fixedCosts")
      .withIndex("by_category", (q) => q.eq("categoryId", args.id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.delete(args.id);
  },
});

/** Seeds the starter folders the first time the page is opened with none saved. */
export const seedCategories = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const existing = await ctx.db.query("fixedCostCategories").collect();
    if (existing.length > 0) return;
    const now = Date.now();
    for (const name of STARTER_CATEGORIES) {
      await ctx.db.insert("fixedCostCategories", { name, key: keyOf(name), createdAt: now });
    }
  },
});

/** One month, every category, with that month's amount where one has been entered. */
export const monthDetail = query({
  args: { token: v.string(), month: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const categories = await ctx.db.query("fixedCostCategories").collect();
    const entries = await ctx.db
      .query("fixedCosts")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .collect();
    const byCategory = new Map(entries.map((e) => [e.categoryId, e]));

    const rows = categories
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => ({
        categoryId: c._id,
        name: c.name,
        amount: byCategory.get(c._id)?.amount ?? null,
      }));
    const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
    return { month: args.month, rows, total };
  },
});

/** Sets (or, with no amount, clears) one category's amount for one month. */
export const setAmount = mutation({
  args: {
    token: v.string(),
    month: v.string(),
    categoryId: v.id("fixedCostCategories"),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const category = await ctx.db.get(args.categoryId);
    if (!category) throw new ConvexError("That category no longer exists.");
    if (args.amount !== undefined && (!Number.isFinite(args.amount) || args.amount < 0)) {
      throw new ConvexError("Amount must be zero or more.");
    }

    const existing = await ctx.db
      .query("fixedCosts")
      .withIndex("by_month_category", (q) => q.eq("month", args.month).eq("categoryId", args.categoryId))
      .unique();

    if (args.amount === undefined) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        amount: args.amount,
        categoryName: category.name,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("fixedCosts", {
        month: args.month,
        categoryId: args.categoryId,
        categoryName: category.name,
        amount: args.amount,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

/** Totals for `count` months ending at `endMonth` (inclusive), oldest first. */
export const monthlyTotals = query({
  args: { token: v.string(), endMonth: v.string(), count: v.number() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const [endYear, endMonthNum] = args.endMonth.split("-").map(Number);
    const months: string[] = [];
    for (let i = args.count - 1; i >= 0; i--) {
      const d = new Date(endYear, endMonthNum - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const all = await ctx.db.query("fixedCosts").collect();
    const totals = new Map<string, number>();
    for (const row of all) totals.set(row.month, (totals.get(row.month) ?? 0) + row.amount);

    return months.map((m) => ({ month: m, total: totals.get(m) ?? 0 }));
  },
});

/**
 * Every booked fixed cost, dated at the start of its month — for the
 * Dashboard, which sums `costs` and this the same way: one dated row per
 * entry, filtered by whatever range the browser has selected. A fixed cost
 * is treated as "spent" on the 1st of the month it was booked for.
 */
export async function allRowsForDashboard(ctx: QueryCtx) {
  const rows = await ctx.db.query("fixedCosts").collect();
  return rows.map((r) => ({
    id: r._id as string,
    name: r.categoryName,
    spentAt: monthStart(r.month),
    amount: r.amount,
  }));
}
