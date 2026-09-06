import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { CATALOGUE } from "./catalogue";
import { ensureBuckets } from "./profit";

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

/**
 * Row counts for whichever deployment you point it at, without needing a
 * session. Handy for telling dev and prod apart:
 *
 *   npx convex run seed:count          # dev
 *   npx convex run --prod seed:count   # production
 */
export const count = internalQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const sales = await ctx.db.query("sales").collect();
    const config = await ctx.db.query("authConfig").first();
    const sessions = await ctx.db.query("sessions").collect();
    return {
      products: products.length,
      sales: sales.length,
      categories: [...new Set(products.map((p) => p.category).filter(Boolean))].length,
      passcodeSet: config !== null,
      activeSessions: sessions.filter((s) => s.expiresAt > Date.now()).length,
    };
  },
});

/*
  The stock lots from the hand-kept profit sheet. Dates are DD/MM/YY.

  Profit is deliberately not copied across — it is derived from sell minus
  buy, which is why one row here differs from the sheet: the fogger's 2nd lot
  reads "sell 180, buy 90, profit 70", but 180 - 90 is 90. The sheet's own
  arithmetic disagrees with itself there, so the prices win.

  The agar's 2nd lot had "ক্রয়" and "বিক্রয়" the wrong way round (buy 9000,
  sell 3200); the stated profit of 5800 only works as sell 9000 / buy 3200,
  which is what is used.
*/
const SHEET: {
  product: string;
  category: string;
  lots: { label: string; date: string; qty: number; buy: number; sell: number }[];
}[] = [
  {
    product: "Hygrometer / হাইড্রোমিটার",
    category: "Farming Equipment",
    lots: [
      { label: "1st stock", date: "2026-08-01", qty: 20, buy: 280, sell: 560 },
      { label: "2nd stock", date: "2026-08-10", qty: 30, buy: 290, sell: 560 },
    ],
  },
  {
    product: "এগার এগার পাউডার/Agar Agar Powder",
    category: "Farmer Products",
    lots: [
      { label: "1st stock", date: "2026-08-01", qty: 2, buy: 2800, sell: 9000 },
      { label: "2nd stock", date: "2026-08-10", qty: 2.5, buy: 3200, sell: 9000 },
    ],
  },
  {
    product: "Fogger 4 nozzle / ফগার ৪ নজেল",
    category: "Farming Equipment",
    lots: [
      { label: "1st stock", date: "2026-09-01", qty: 50, buy: 100, sell: 180 },
      { label: "2nd stock", date: "2026-09-05", qty: 80, buy: 90, sell: 180 },
    ],
  },
  {
    product: "Fogger 5 nozzle / ফগার ৫ নজেল",
    category: "Farming Equipment",
    lots: [{ label: "1st stock", date: "2026-09-01", qty: 50, buy: 120, sell: 220 }],
  },
  {
    product: "Single 12v DC Motor / সিঙ্গেল ১২ভি ডিসি মোটর",
    category: "Farming Equipment",
    lots: [{ label: "1st stock", date: "2026-09-01", qty: 50, buy: 400, sell: 650 }],
  },
  {
    product: "Double 12v DC Motor / ডাবল ১২ভি ডিসি মোটর",
    category: "Farming Equipment",
    lots: [{ label: "1st stock", date: "2026-09-01", qty: 50, buy: 800, sell: 1200 }],
  },
  {
    product: "DGDR Heater / ডিজিডিআর হিটার",
    category: "Farming Equipment",
    lots: [{ label: "1st stock", date: "2026-09-01", qty: 50, buy: 800, sell: 1200 }],
  },
];

/**
 * Loads the allocation split and the profit sheet's stock lots.
 *
 *   npx convex run seed:profitSheet
 *   npx convex run --prod seed:profitSheet
 *
 * Existing stock lots are cleared first so it is safe to re-run. Products,
 * sales and the passcode are untouched; a product named in the sheet that is
 * not in the catalogue is created.
 */
export const profitSheet = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ensureBuckets(ctx);

    let cleared = 0;
    for (const b of await ctx.db.query("stockBatches").collect()) {
      await ctx.db.delete(b._id);
      cleared++;
    }

    const all = await ctx.db.query("products").collect();
    let createdProducts = 0;
    let lots = 0;

    for (const entry of SHEET) {
      let product = all.find((p) => p.name === entry.product);
      if (!product) {
        const id = await ctx.db.insert("products", {
          name: entry.product,
          costPrice: entry.lots[0].buy,
          details: "Added from the profit calculation sheet.",
          category: entry.category,
          quantity: entry.lots.reduce((sum, l) => sum + l.qty, 0),
          archived: false,
          createdAt: Date.parse(entry.lots[0].date),
        });
        product = (await ctx.db.get(id))!;
        all.push(product);
        createdProducts++;
      }

      for (const lot of entry.lots) {
        await ctx.db.insert("stockBatches", {
          productId: product._id,
          productName: product.name,
          label: lot.label,
          purchasedAt: Date.parse(lot.date),
          quantity: lot.qty,
          unitCost: lot.buy,
          unitPrice: lot.sell,
        });
        lots++;
      }
    }

    return (
      `Cleared ${cleared} old lots. Seeded ${lots} stock lots across ${SHEET.length} products ` +
      `(${createdProducts} newly created) and the 7 allocation categories.`
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
