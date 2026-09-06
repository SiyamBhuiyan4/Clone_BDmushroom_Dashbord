import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { CATALOGUE } from "./catalogue";

/**
 * Development helpers. These are internal functions — not reachable from the
 * browser, only from the CLI:
 *
 *   npx convex run seed:demo    # load the bdmushroom.com catalogue + sample sales
 *   npx convex run seed:clear   # wipe every product and sale
 *
 * `demo` clears first, so it is safe to re-run and always lands on the same
 * result.
 */

const DAY = 24 * 60 * 60 * 1000;
const SALE_COUNT = 90;
const BUYERS = [
  "Rifat",
  "Nusrat",
  "Tanvir",
  "Sadia",
  "Arif",
  "Mehedi",
  "Priya",
  "Sabbir",
  "Jannat",
  "Hasan",
];
const NOTES = ["Paid via bKash.", "Paid via Nagad.", "Cash on delivery.", "Pickup from farm."];

/** Small deterministic PRNG so repeated seeds produce identical data. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function wipe(ctx: MutationCtx) {
  const sales = await ctx.db.query("sales").collect();
  for (const s of sales) await ctx.db.delete(s._id);
  const products = await ctx.db.query("products").collect();
  for (const p of products) await ctx.db.delete(p._id);
  return { products: products.length, sales: sales.length };
}

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const removed = await wipe(ctx);

    const random = makeRandom(20260906);
    const now = Date.now();

    const created: {
      id: Id<"products">;
      name: string;
      cost: number;
      low: number;
      high: number;
    }[] = [];

    for (const item of CATALOGUE) {
      // Seed extra stock, since the sales below consume some of it.
      const id = await ctx.db.insert("products", {
        name: item.name,
        costPrice: item.cost,
        details: item.details,
        category: item.category,
        quantity: item.stock + 12,
        archived: false,
        createdAt: now - Math.floor(random() * 200) * DAY,
      });
      created.push({
        id,
        name: item.name,
        cost: item.cost,
        low: item.retailLow,
        high: item.retailHigh,
      });
    }

    let sold = 0;
    for (let i = 0; i < SALE_COUNT; i++) {
      const product = created[Math.floor(random() * created.length)];
      // Weight toward recent days so the trend chart has a visible shape.
      const daysAgo = Math.floor(random() ** 1.7 * 90);
      // Sell somewhere in the product's real listed range.
      const unitPrice = Math.round(product.low + random() * (product.high - product.low));
      const quantity = random() < 0.75 ? 1 : 1 + Math.floor(random() * 3);

      const current = await ctx.db.get(product.id);
      if (!current || current.quantity < quantity) continue;
      await ctx.db.patch(product.id, { quantity: current.quantity - quantity });

      await ctx.db.insert("sales", {
        productId: product.id,
        productName: product.name,
        unitCost: product.cost,
        unitPrice,
        quantity,
        buyer: random() < 0.65 ? BUYERS[Math.floor(random() * BUYERS.length)] : undefined,
        note: random() < 0.3 ? NOTES[Math.floor(random() * NOTES.length)] : undefined,
        soldAt: now - daysAgo * DAY - Math.floor(random() * DAY),
      });
      sold++;
    }

    return (
      `Cleared ${removed.products} products and ${removed.sales} sales. ` +
      `Seeded ${created.length} products from bdmushroom.com and ${sold} sales.`
    );
  },
});

export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const removed = await wipe(ctx);
    return `Deleted ${removed.products} products and ${removed.sales} sales.`;
  },
});
