import { mutation, query, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireSession, verifyPasscode } from "./auth";

/*
  Product categories and sub-categories.
  Supports hierarchical categorization (Category -> Sub-category)
  for mushrooms, spawn, dry mushrooms, and related products.
*/

export const STARTER_PRODUCT_CATEGORIES = [
  {
    key: "fresh",
    name: "Fresh Mushroom",
    nameBn: "তাজা মাশরুম",
    subcategories: [
      { name: "Oyster Mushroom", nameBn: "ওয়েস্টার মাশরুম" },
      { name: "Button Mushroom", nameBn: "বাটন মাশরুম" },
      { name: "Milky Mushroom", nameBn: "মিল্কি মাশরুম" },
      { name: "Shiitake Mushroom", nameBn: "শিতাকে মাশরুম" },
    ],
  },
  {
    key: "dry",
    name: "Dry Mushroom",
    nameBn: "শুকনো মাশরুম",
    subcategories: [
      { name: "Whole Dry Mushroom", nameBn: "আস্ত শুকনো মাশরুম" },
      { name: "Mushroom Powder", nameBn: "মাশরুম গুঁড়া" },
    ],
  },
  {
    key: "spawn",
    name: "Spawn & Culture",
    nameBn: "স্পন ও কালচার",
    subcategories: [
      { name: "Mother Spawn", nameBn: "মাদার স্পন" },
      { name: "Commercial Spawn", nameBn: "বাণিজ্যিক স্পন" },
      { name: "Tissue Culture & Slant", nameBn: "টিস্যু কালচার ও স্ল্যান্ট" },
    ],
  },
  {
    key: "value_added",
    name: "Value-Added Products",
    nameBn: "প্রক্রিয়াজাত পণ্য",
    subcategories: [
      { name: "Mushroom Pickle", nameBn: "মাশরুম আচার" },
      { name: "Mushroom Biscuit", nameBn: "মাশরুম বিস্কুট" },
      { name: "Mushroom Tea", nameBn: "মাশরুম চা" },
    ],
  },
  {
    key: "other",
    name: "Other Products",
    nameBn: "অন্যান্য পণ্য",
    subcategories: [],
  },
];

/** Populates the starter categories and subcategories if none exist. */
export async function ensureStarterCategories(ctx: MutationCtx) {
  const existing = await ctx.db.query("productCategories").withIndex("by_order").collect();
  if (existing.length > 0) return existing;
  const now = Date.now();
  let order = 0;
  for (const parent of STARTER_PRODUCT_CATEGORIES) {
    const parentId = await ctx.db.insert("productCategories", {
      name: parent.name,
      nameBn: parent.nameBn,
      key: parent.key,
      order: order++,
      createdAt: now,
    });
    for (const sub of parent.subcategories) {
      await ctx.db.insert("productCategories", {
        name: sub.name,
        nameBn: sub.nameBn,
        parentId,
        order: order++,
        createdAt: now,
      });
    }
  }
  return await ctx.db.query("productCategories").withIndex("by_order").collect();
}

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const all = await ctx.db.query("productCategories").withIndex("by_order").collect();
    return all;
  },
});

function cleanName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new ConvexError("A category name is required.");
  return trimmed;
}

async function assertUnique(ctx: MutationCtx, name: string, parentId?: string, except?: string) {
  const all = await ctx.db.query("productCategories").collect();
  const clash = all.find(
    (c) =>
      c._id !== except &&
      (c.parentId as string | undefined) === parentId &&
      c.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new ConvexError(`A category named "${clash.name}" already exists.`);
}

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    nameBn: v.optional(v.string()),
    parentId: v.optional(v.id("productCategories")),
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

    const all = await ctx.db.query("productCategories").collect();
    const order = all.reduce((max, c) => Math.max(max, c.order), -1) + 1;
    return await ctx.db.insert("productCategories", {
      name,
      nameBn: args.nameBn?.trim() || undefined,
      parentId: args.parentId,
      order,
      createdAt: Date.now(),
    });
  },
});

export const rename = mutation({
  args: { token: v.string(), id: v.id("productCategories"), name: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That category no longer exists.");
    const name = cleanName(args.name);
    if (name === row.name) return;
    await assertUnique(ctx, name, row.parentId, args.id);
    await ctx.db.patch(args.id, { name, nameBn: undefined });

    // Also update any products carrying this category or subcategory name as text
    if (!row.parentId) {
      const products = await ctx.db.query("products").collect();
      for (const p of products) {
        if (p.categoryId === args.id || p.category === row.name) {
          await ctx.db.patch(p._id, { category: name });
        }
      }
    } else {
      const products = await ctx.db.query("products").collect();
      for (const p of products) {
        if (p.subCategoryId === args.id || p.subCategory === row.name) {
          await ctx.db.patch(p._id, { subCategory: name });
        }
      }
    }
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("productCategories"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const row = await ctx.db.get(args.id);
    if (!row) return;

    if (!row.parentId) {
      // Deleting a parent category: delete its sub-categories and un-assign products
      const subcats = await ctx.db
        .query("productCategories")
        .withIndex("by_parent", (q) => q.eq("parentId", args.id))
        .collect();
      for (const sub of subcats) {
        const productsWithSub = await ctx.db.query("products").collect();
        for (const p of productsWithSub) {
          if (p.subCategoryId === sub._id || p.subCategory === sub.name) {
            await ctx.db.patch(p._id, { subCategoryId: undefined, subCategory: undefined });
          }
        }
        await ctx.db.delete(sub._id);
      }
      const products = await ctx.db.query("products").collect();
      for (const p of products) {
        if (p.categoryId === args.id || p.category === row.name) {
          await ctx.db.patch(p._id, { categoryId: undefined, category: undefined });
        }
      }
    } else {
      // Deleting a sub-category
      const products = await ctx.db.query("products").collect();
      for (const p of products) {
        if (p.subCategoryId === args.id || p.subCategory === row.name) {
          await ctx.db.patch(p._id, { subCategoryId: undefined, subCategory: undefined });
        }
      }
    }

    await ctx.db.delete(args.id);
  },
});
