import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession } from "./auth";

const LOW_STOCK_AT = 3;
const WINDOW_DAYS = 365;

/**
 * Everything the dashboard renders, in one subscription.
 *
 * Range-scoped numbers are deliberately *not* aggregated here: bucketing by
 * calendar day and applying the "last N days" filter both depend on the
 * browser's timezone. This returns one compact row per sale in the window and
 * lets the client slice it, so a single date-range control can scope every
 * card on the page consistently.
 */
export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const products = await ctx.db.query("products").collect();
    const sales = await ctx.db.query("sales").withIndex("by_soldAt").order("desc").collect();

    let revenue = 0;
    let cost = 0;
    let unitsSold = 0;
    for (const s of sales) {
      revenue += s.unitPrice * s.quantity;
      cost += s.unitCost * s.quantity;
      unitsSold += s.quantity;
    }

    const active = products.filter((p) => !p.archived);
    let unitsInStock = 0;
    let inventoryCost = 0;
    for (const p of active) {
      unitsInStock += p.quantity;
      inventoryCost += p.quantity * p.costPrice;
    }

    // One extra day of slack so a timezone shift can't clip the oldest bucket.
    const since = Date.now() - (WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000;

    return {
      allTime: {
        revenue,
        cost,
        profit: revenue - cost,
        margin: revenue > 0 ? (revenue - cost) / revenue : 0,
        salesCount: sales.length,
        unitsSold,
      },
      inventory: {
        productCount: active.length,
        archivedCount: products.length - active.length,
        unitsInStock,
        inventoryCost,
        inStockCount: active.filter((p) => p.quantity > 0).length,
        outOfStockCount: active.filter((p) => p.quantity === 0).length,
        lowStock: active
          .filter((p) => p.quantity > 0 && p.quantity <= LOW_STOCK_AT)
          .sort((a, b) => a.quantity - b.quantity)
          .slice(0, 6),
      },
      recentSales: sales.slice(0, 8),
      windowSales: sales
        .filter((s) => s.soldAt >= since)
        .map((s) => ({
          id: s._id as string,
          productId: s.productId as string,
          productName: s.productName,
          soldAt: s.soldAt,
          units: s.quantity,
          revenue: s.unitPrice * s.quantity,
          profit: (s.unitPrice - s.unitCost) * s.quantity,
        })),
      windowDays: WINDOW_DAYS,
    };
  },
});
