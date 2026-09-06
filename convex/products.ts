import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireSession } from "./auth";

export const list = query({
  args: {
    token: v.string(),
    search: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const all = await ctx.db.query("products").withIndex("by_createdAt").order("desc").collect();
    const term = (args.search ?? "").trim().toLowerCase();
    return all.filter((p) => {
      if (!args.includeArchived && p.archived) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.details.toLowerCase().includes(term) ||
        (p.category ?? "").toLowerCase().includes(term)
      );
    });
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("products") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    return await ctx.db.get(args.id);
  },
});

/** Distinct categories, for the filter dropdown and the category input's datalist. */
export const categories = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const all = await ctx.db.query("products").collect();
    const set = new Set<string>();
    for (const p of all) {
      const c = (p.category ?? "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  },
});

function validate(name: string, costPrice: number, quantity: number) {
  if (!name.trim()) throw new ConvexError("Product name is required.");
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    throw new ConvexError("Cost price must be zero or more.");
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new ConvexError("Quantity must be a whole number, zero or more.");
  }
}

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    costPrice: v.number(),
    details: v.string(),
    category: v.optional(v.string()),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    validate(args.name, args.costPrice, args.quantity);
    const category = (args.category ?? "").trim();
    return await ctx.db.insert("products", {
      name: args.name.trim(),
      costPrice: args.costPrice,
      details: args.details.trim(),
      category: category ? category : undefined,
      quantity: args.quantity,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("products"),
    name: v.string(),
    costPrice: v.number(),
    details: v.string(),
    category: v.optional(v.string()),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError("That product no longer exists.");
    validate(args.name, args.costPrice, args.quantity);
    const category = (args.category ?? "").trim();
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      costPrice: args.costPrice,
      details: args.details.trim(),
      category: category ? category : undefined,
      quantity: args.quantity,
    });
  },
});

/** Add or remove units without touching the rest of the product. */
export const restock = mutation({
  args: { token: v.string(), id: v.id("products"), delta: v.number() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const product = await ctx.db.get(args.id);
    if (!product) throw new ConvexError("That product no longer exists.");
    if (!Number.isInteger(args.delta)) throw new ConvexError("Use whole units.");
    const next = product.quantity + args.delta;
    if (next < 0) throw new ConvexError("Stock cannot go below zero.");
    await ctx.db.patch(args.id, { quantity: next });
  },
});

export const setArchived = mutation({
  args: { token: v.string(), id: v.id("products"), archived: v.boolean() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await ctx.db.patch(args.id, { archived: args.archived });
  },
});

/**
 * Deletes the product. Past sales keep their own snapshot of the name and
 * cost, so revenue and profit history are unaffected.
 */
export const remove = mutation({
  args: { token: v.string(), id: v.id("products") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await ctx.db.delete(args.id);
  },
});
