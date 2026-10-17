import { mutation, query, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireSession, verifyPasscode } from "./auth";

/*
  The categories vendors are filed under.
  Supports hierarchical sub-categories (Category -> Sub-category)
  for suppliers in the mushroom business.
*/
export const STARTER_CATEGORIES = [
  {
    key: "spawn",
    name: "Mushroom Spawn & Culture",
    nameBn: "মাশরুম স্পন ও কালচার",
    subcategories: [
      { name: "Mother Spawn", nameBn: "মাদার স্পন" },
      { name: "Commercial Spawn", nameBn: "বাণিজ্যিক স্পন" },
      { name: "Tissue Culture & Slant", nameBn: "টিস্যু কালচার ও স্ল্যান্ট" },
    ],
  },
  {
    key: "materials",
    name: "Growing Materials",
    nameBn: "চাষের কাঁচামাল",
    subcategories: [
      { name: "Sawdust & Straw", nameBn: "কাঠের গুঁড়া ও খড়" },
      { name: "Wheat Bran & Calcium", nameBn: "গমের ভুসি ও চুন" },
      { name: "PP Spawn Bags", nameBn: "পিপি প্যাকেট ও স্পন ব্যাগ" },
    ],
  },
  {
    key: "equipment",
    name: "Farming Equipment",
    nameBn: "চাষের যন্ত্রপাতি",
    subcategories: [
      { name: "Autoclave & Steamers", nameBn: "অটোক্লেভ ও স্টিমার" },
      { name: "Laminar Airflow", nameBn: "ল্যামিনার এয়ারফ্লো" },
      { name: "Humidifier & Nozzles", nameBn: "হিউমিডিফায়ার ও নজেল" },
    ],
  },
  {
    key: "packaging",
    name: "Packaging & Supplies",
    nameBn: "প্যাকেজিং ও সরঞ্জাম",
    subcategories: [
      { name: "Poly & Sealing Bags", nameBn: "পলি ও সিলিং ব্যাগ" },
      { name: "Labels & Cartons", nameBn: "লেবেল ও কার্টন" },
    ],
  },
  {
    key: "other",
    name: "Others",
    nameBn: "অন্যান্য",
    subcategories: [],
  },
];

/** Creates the starter list and subcategories the first time anything needs it. */
export async function ensureStarterCategories(ctx: MutationCtx) {
  const existing = await ctx.db.query("vendorCategories").withIndex("by_order").collect();
  if (existing.length > 0) return existing;
  const now = Date.now();
  let order = 0;
  for (const parent of STARTER_CATEGORIES) {
    const parentId = await ctx.db.insert("vendorCategories", {
      name: parent.name,
      nameBn: parent.nameBn,
      key: parent.key,
      order: order++,
      createdAt: now,
    });
    for (const sub of parent.subcategories) {
      await ctx.db.insert("vendorCategories", {
        name: sub.name,
        nameBn: sub.nameBn,
        parentId,
        order: order++,
        createdAt: now,
      });
    }
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

async function assertUnique(ctx: MutationCtx, name: string, parentId?: string, except?: string) {
  const all = await ctx.db.query("vendorCategories").collect();
  const clash = all.find(
    (c) =>
      c._id !== except &&
      (c.parentId as string | undefined) === parentId &&
      c.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new ConvexError(`There is already a category called ${clash.name}.`);
}

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    nameBn: v.optional(v.string()),
    parentId: v.optional(v.id("vendorCategories")),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await ensureStarterCategories(ctx);
    const name = cleanName(args.name);
    await assertUnique(ctx, name, args.parentId);

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new ConvexError("Parent category no longer exists.");
    }

    const all = await ctx.db.query("vendorCategories").collect();
    const order = all.reduce((max, c) => Math.max(max, c.order), -1) + 1;
    return await ctx.db.insert("vendorCategories", {
      name,
      nameBn: args.nameBn?.trim() || undefined,
      parentId: args.parentId,
      order,
      createdAt: Date.now(),
    });
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
    await assertUnique(ctx, name, row.parentId, args.id);
    await ctx.db.patch(args.id, { name, nameBn: undefined });
  },
});

/**
 * Deletes a category or subcategory.
 * If parent: also removes its subcategories and unassigns affected vendors.
 */
export const remove = mutation({
  args: { token: v.string(), id: v.id("vendorCategories"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const row = await ctx.db.get(args.id);
    if (!row) return;

    if (!row.parentId) {
      // Removing parent category
      const subcats = await ctx.db
        .query("vendorCategories")
        .withIndex("by_parent", (q) => q.eq("parentId", args.id))
        .collect();
      for (const sub of subcats) {
        const vendorsWithSub = await ctx.db.query("vendors").collect();
        for (const v of vendorsWithSub) {
          if (v.subCategoryId === sub._id) {
            await ctx.db.patch(v._id, { subCategoryId: undefined });
          }
        }
        await ctx.db.delete(sub._id);
      }
      const vendors = await ctx.db
        .query("vendors")
        .withIndex("by_categoryId", (q) => q.eq("categoryId", args.id))
        .collect();
      for (const vendor of vendors) {
        await ctx.db.patch(vendor._id, { categoryId: undefined, subCategoryId: undefined });
      }
    } else {
      // Removing sub-category
      const vendors = await ctx.db.query("vendors").collect();
      for (const v of vendors) {
        if (v.subCategoryId === args.id) {
          await ctx.db.patch(v._id, { subCategoryId: undefined });
        }
      }
    }

    await ctx.db.delete(args.id);
  },
});

/** Saves a new order for the list, as dragged on the Vendors page. */
export const reorder = mutation({
  args: { token: v.string(), ids: v.array(v.id("vendorCategories")) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const all = await ctx.db.query("vendorCategories").collect();
    for (const [order, id] of args.ids.entries()) {
      if (all.some((c) => c._id === id)) {
        await ctx.db.patch(id, { order });
      }
    }
  },
});
