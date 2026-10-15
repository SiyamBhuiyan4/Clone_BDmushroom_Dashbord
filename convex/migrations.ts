import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { syncProduct } from "./stock";

/*
  One-time move to lot-only stock, run by hand from the CLI
  (`npx convex run migrations:lotsOnly '{"dryRun": true}'` first, then
  without it), never from the app itself.

  - Every lot without a sell price gets the one its product had (or its
    size's, for a lot bought for one size).
  - A lot bought for one size is named after that size, since the size now
    lives on the lot and not the product.
  - Sizes come off products, and each product's stock and prices are
    recomputed from its lots — so what is left in the lots becomes the stock.
*/
export const lotsOnly = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const write = !args.dryRun;
    const products = await ctx.db.query("products").collect();
    const lots = await ctx.db.query("stockBatches").collect();
    const report = [];

    for (const product of products) {
      const own = lots.filter((l) => l.productId === product._id);
      for (const lot of own) {
        const variant = lot.variantId ? product.variants?.find((x) => x.id === lot.variantId) : undefined;
        const patch: { unitPrice?: number; label?: string } = {};
        if (lot.unitPrice === undefined) {
          const price = variant?.sellPrice ?? product.sellPrice;
          if (price !== undefined) patch.unitPrice = price;
        }
        const size = variant?.label ?? lot.variantLabel;
        if (size && !lot.label.includes(size)) patch.label = `${size} · ${lot.label}`;
        if (write && Object.keys(patch).length > 0) await ctx.db.patch(lot._id, patch);
      }

      const stockBefore = product.quantity;
      if (write) {
        if (product.variants || product.stockMode) {
          await ctx.db.patch(product._id, { variants: undefined, stockMode: undefined });
        }
        await syncProduct(ctx, product._id);
      }
      report.push({
        name: product.name,
        stockBefore,
        stockAfter: own.reduce((sum, l) => sum + (l.remaining ?? l.quantity), 0),
        lots: own.length,
        hadSizes: Boolean(product.variants?.length),
      });
    }
    return report;
  },
});
