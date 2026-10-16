import { mutation, query, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireSession, verifyPasscode } from "./auth";

/*
  The categories vendors are filed under. The shop starts with the five it
  always had, and adds, renames or removes its own from the Vendors page.
*/
export const STARTER_CATEGORIES = [
  { key: "spawn", name: "Mushroom Spawn & Culture", nameBn: "মাশরুম স্পন ও কালচার" },
  { key: "materials", name: "Growing Materials", nameBn: "চাষের কাঁচামাল" },
  { key: "equipment", name: "Farming Equipment", nameBn: "চাষের যন্ত্রপাতি" },
  { key: "packaging", name: "Packaging & Supplies", nameBn: "প্যাকেজিং ও সরঞ্জাম" },
  { key: "other", name: "Others", nameBn: "অন্যান্য" },
];

/** Creates the starter list the first time anything needs it. */
export async function ensureStarterCategories(ctx: MutationCtx) {
  const existing = await ctx.db.query("vendorCategories").withIndex("by_order").collect();
  if (existing.length > 0) return existing;
  const now = Date.now();
  for (const [order, c] of STARTER_CATEGORIES.entries()) {
    await ctx.db.insert("vendorCategories", { ...c, order, createdAt: now });
  }
  return await ctx.db.query("vendorCategories").withIndex("by_order").collect();
}

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    return await ctx.db.query("vendorCategories").withIndex("by_order").collect();
  },
});

function cleanName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new ConvexError("A category needs a name.");
  return trimmed;
}

async function assertUnique(ctx: MutationCtx, name: string, except?: string) {
  const all = await ctx.db.query("vendorCategories").collect();
  const clash = all.find((c) => c._id !== except && c.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new ConvexError(`There is already a category called ${clash.name}.`);
}

export const create = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const existing = await ensureStarterCategories(ctx);
    const name = cleanName(args.name);
    await assertUnique(ctx, name);
    const order = existing.reduce((max, c) => Math.max(max, c.order), -1) + 1;
    return await ctx.db.insert("vendorCategories", { name, order, createdAt: Date.now() });
  },
});

/** Renaming drops the Bangla name — it described the old one. */
export const rename = mutation({
  args: { token: v.string(), id: v.id("vendorCategories"), name: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That category no longer exists.");
    const name = cleanName(args.name);
    if (name === row.name) return;
    await assertUnique(ctx, name, args.id);
    await ctx.db.patch(args.id, { name, nameBn: undefined });
  },
});

/**
 * Deletes a category. Its vendors are kept and become uncategorised — a
 * category is a label on them, not something they belong to.
 */
export const remove = mutation({
  args: { token: v.string(), id: v.id("vendorCategories"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.id))
      .collect();
    for (const vendor of vendors) await ctx.db.patch(vendor._id, { categoryId: undefined });
    await ctx.db.delete(args.id);
    return { uncategorised: vendors.length };
  },
});
