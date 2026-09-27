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
    /*
      Operating costs — van fuel, the electricity bill — which is what turns
      gross profit into net. Kept separate from a sale's `unitCost`, because
      that one is recovered when the unit sells and an operating cost never
      is; adding them together would make both figures meaningless.
    */
    const costs = await ctx.db.query("costs").withIndex("by_spentAt").order("desc").collect();

    let revenue = 0;
    let cost = 0;
    let unitsSold = 0;
    for (const s of sales) {
      revenue += s.unitPrice * s.quantity;
      cost += s.unitCost * s.quantity;
      unitsSold += s.quantity;
    }

    let operatingCost = 0;
    for (const c of costs) operatingCost += c.amount;

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
        /*
          `profit` is gross — revenue less what the units cost to buy. `net`
          takes the operating costs off that. Both are reported because a shop
          that only sees one of them cannot tell a thin margin from an
          expensive month.
        */
        profit: revenue - cost,
        operatingCost,
        net: revenue - cost - operatingCost,
        margin: revenue > 0 ? (revenue - cost) / revenue : 0,
        netMargin: revenue > 0 ? (revenue - cost - operatingCost) / revenue : 0,
        salesCount: sales.length,
        unitsSold,
        costsCount: costs.length,
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
      /*
        One dated row per cost in the window, for the same reason the sales
        are not pre-aggregated: the page's range control is applied in the
        browser's timezone, and a total summed here could not be re-scoped
        without a second round trip.
      */
      windowCosts: costs
        .filter((c) => c.spentAt >= since)
        .map((c) => ({
          id: c._id as string,
          name: c.name,
          spentAt: c.spentAt,
          amount: c.amount,
        })),
      windowDays: WINDOW_DAYS,
    };
  },
});
