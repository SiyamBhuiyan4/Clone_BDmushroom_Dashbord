import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/*
  Stock lives in lots, and only in lots.

  A product's `quantity`, `costPrice` and `sellPrice` are a cache of what its
  lots say — the sum of what is left in them, and the cheapest buy and sell
  price among the ones that still have stock. Every write that moves a lot
  calls `syncProduct` afterwards, so the rest of the app (Dashboard, sorting,
  low-stock badges) can keep reading those three fields without having to
  learn what a lot is. Nothing writes them any other way.
*/

const left = (lot: Doc<"stockBatches">) => lot.remaining ?? lot.quantity;

export async function lotsOf(ctx: MutationCtx, productId: Id<"products">) {
  return await ctx.db
    .query("stockBatches")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
}

/**
 * Recomputes a product's cached stock and prices from its lots. A product
 * whose lots are all empty keeps the last prices it had — there is nothing
 * truer to put there, and zeroing them would make it look free.
 */
export async function syncProduct(ctx: MutationCtx, productId: Id<"products">) {
  const product = await ctx.db.get(productId);
  if (!product) return;
  const lots = await lotsOf(ctx, productId);
  const open = lots.filter((l) => left(l) > 0);
  const quantity = lots.reduce((sum, l) => sum + left(l), 0);
  const costs = open.map((l) => l.unitCost);
  const sells = open.map((l) => l.unitPrice).filter((p): p is number => p !== undefined);
  await ctx.db.patch(productId, {
    quantity,
    costPrice: costs.length > 0 ? Math.min(...costs) : product.costPrice,
    sellPrice: sells.length > 0 ? Math.min(...sells) : product.sellPrice,
  });
}

/** The lot a sale draws from when none was picked: the oldest one with stock left. */
export async function oldestOpenLot(ctx: MutationCtx, productId: Id<"products">) {
  const lots = await lotsOf(ctx, productId);
  return lots.filter((l) => left(l) > 0).sort((a, b) => a.purchasedAt - b.purchasedAt)[0] ?? null;
}

/**
 * Takes sold units out of a lot. Clamped at zero: an oversell is allowed
 * with the passcode, and a lot reading below empty helps nobody.
 */
export async function takeFromLot(ctx: MutationCtx, lotId: Id<"stockBatches">, quantity: number) {
  const lot = await ctx.db.get(lotId);
  if (!lot) return;
  await ctx.db.patch(lotId, { remaining: Math.max(0, left(lot) - quantity) });
  await syncProduct(ctx, lot.productId);
}

/**
 * Puts a cancelled or deleted sale's units back on the shelf — into the lot
 * they came out of. A sale recorded before every sale named its lot has
 * nowhere to go back to, so it comes back as a lot of its own at the cost it
 * was sold at, rather than being added to a lot it never came from. So does
 * one whose lot has since been taken off the product.
 */
export async function returnSaleToStock(ctx: MutationCtx, sale: Doc<"sales">) {
  const product = await ctx.db.get(sale.productId);
  if (!product) return;
  const lot = sale.batchId ? await ctx.db.get(sale.batchId) : null;
  // A lot taken off its product is closed; units coming back start a new one.
  if (lot && !lot.removedAt) {
    await ctx.db.patch(lot._id, { remaining: Math.min(lot.quantity, left(lot) + sale.quantity) });
  } else {
    await ctx.db.insert("stockBatches", {
      productId: sale.productId,
      productName: product.name,
      label: "Returned stock",
      purchasedAt: sale.soldAt,
      quantity: sale.quantity,
      remaining: sale.quantity,
      unitCost: sale.unitCost,
      unitPrice: product.sellPrice,
    });
  }
  await syncProduct(ctx, sale.productId);
}
