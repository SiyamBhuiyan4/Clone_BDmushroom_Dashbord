import { mutation, query, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireSession } from "./auth";

/*
  Operating costs — money the business spends that is not the price of stock.

  Two tables, because they answer two different questions. `costs` is the
  ledger: what was spent, when, how much. `costNames` is the shop's own
  vocabulary: the handful of things it spends on again and again. Ticking
  "save this name" on a cost adds it to that vocabulary, and from then on it
  is searched and picked rather than retyped — which is the only way a report
  grouped by name stays meaningful. Typed freely, "office snacks", "Office
  Snack" and "snacks for office" are three lines in that report; picked from
  the list, they are one.
*/

/*
  Starting vocabulary, shown while the shop has none of its own. These are
  suggestions, not rows: nothing is written until a cost is saved against one
  with the tick on. That keeps the list honest — it only ever holds names the
  business has actually chosen to keep — and means emptying it deliberately
  leaves you back at these rather than at a blank page.
*/
export const EXAMPLE_COST_NAMES = [
  "Office snacks",
  "Staff lunch",
  "Delivery fuel",
  "Electricity bill",
  "Internet bill",
  "Packaging materials",
  "Farm labour",
  "Shop rent",
  "Marketing & ads",
  "Repairs & maintenance",
];

/** Lowercased and space-collapsed, so "Office  Snacks" and "office snacks" meet. */
function keyOf(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function validate(name: string, amount: number) {
  if (!name.trim()) throw new ConvexError("Give the cost a name.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ConvexError("A cost has to be more than zero.");
  }
}

/* ------------------------------------------------------------------ names */

/**
 * The saved names, most-used first, with the examples standing in while the
 * shop has none. A suggestion carries a null id — the client shows it and may
 * pass its text, but only a real row can be pointed at by `costNameId`.
 */
export const names = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const rows = await ctx.db.query("costNames").collect();
    if (rows.length === 0) {
      return EXAMPLE_COST_NAMES.map((name) => ({
        _id: null as Id<"costNames"> | null,
        name,
        usageCount: 0,
        lastUsedAt: undefined as number | undefined,
        suggestion: true,
      }));
    }
    return rows
      .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name))
      .map((r) => ({
        _id: r._id as Id<"costNames"> | null,
        name: r.name,
        usageCount: r.usageCount,
        lastUsedAt: r.lastUsedAt,
        suggestion: false,
      }));
  },
});

/**
 * Finds the saved name, or writes it.
 *
 * Returns the text the cost should be recorded under as well as the id,
 * because a match is not necessarily a match in spelling: typing "office
 * SNACKS" when "Office snacks" is already saved has to land in the ledger as
 * the saved one. Otherwise the ledger fills up with the variants the saved
 * list exists to prevent, and a report grouped by name shows the same expense
 * three times.
 *
 * `id` is null when the tick was off and the name is not already known — the
 * cost still records, it just does not join the vocabulary.
 */
async function resolveName(ctx: MutationCtx, typed: string, save: boolean) {
  const name = typed.trim();
  const key = keyOf(name);
  const existing = await ctx.db
    .query("costNames")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (existing) {
    // Using a saved name is what makes it float to the top of the list next
    // time, whether or not the tick was on.
    await ctx.db.patch(existing._id, {
      usageCount: existing.usageCount + 1,
      lastUsedAt: Date.now(),
    });
    return { id: existing._id, name: existing.name };
  }
  if (!save) return { id: null, name };

  const id = await ctx.db.insert("costNames", {
    name,
    key,
    usageCount: 1,
    lastUsedAt: Date.now(),
    createdAt: Date.now(),
  });
  return { id, name };
}

/**
 * Removes a saved name. The costs recorded against it keep their own copy of
 * the text, so history reads exactly as it did before — only the pick list
 * changes.
 */
export const removeName = mutation({
  args: { token: v.string(), id: v.id("costNames") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row) return;
    for (const cost of await ctx.db
      .query("costs")
      .withIndex("by_costName", (q) => q.eq("costNameId", args.id))
      .collect()) {
      await ctx.db.patch(cost._id, { costNameId: undefined });
    }
    await ctx.db.delete(args.id);
  },
});

/** Renames a saved name in place, leaving recorded costs untouched. */
export const renameName = mutation({
  args: { token: v.string(), id: v.id("costNames"), name: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That name no longer exists.");
    const name = args.name.trim();
    if (!name) throw new ConvexError("Give the name something to say.");

    const key = keyOf(name);
    const clash = await ctx.db
      .query("costNames")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (clash && clash._id !== args.id) throw new ConvexError(`"${name}" is already saved.`);

    await ctx.db.patch(args.id, { name, key });
  },
});

/* ------------------------------------------------------------------ costs */

export const list = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const q = ctx.db.query("costs").withIndex("by_spentAt").order("desc");
    return args.limit ? await q.take(args.limit) : await q.collect();
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    amount: v.number(),
    spentAt: v.optional(v.number()),
    note: v.optional(v.string()),
    /** The tick: keep this name for next time. */
    saveName: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    validate(args.name, args.amount);

    const resolved = await resolveName(ctx, args.name, args.saveName ?? false);
    const note = (args.note ?? "").trim();

    return await ctx.db.insert("costs", {
      name: resolved.name,
      costNameId: resolved.id ?? undefined,
      amount: args.amount,
      spentAt: args.spentAt ?? Date.now(),
      note: note ? note : undefined,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("costs"),
    name: v.string(),
    amount: v.number(),
    spentAt: v.optional(v.number()),
    note: v.optional(v.string()),
    saveName: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const cost = await ctx.db.get(args.id);
    if (!cost) throw new ConvexError("That cost no longer exists.");
    validate(args.name, args.amount);

    /*
      Only a changed name is resolved again. Re-resolving an unchanged one
      would count the same cost against the vocabulary twice every time
      someone corrected a typo in the note.
    */
    let name = args.name.trim();
    let costNameId = cost.costNameId;
    if (keyOf(name) !== keyOf(cost.name)) {
      const resolved = await resolveName(ctx, name, args.saveName ?? false);
      name = resolved.name;
      costNameId = resolved.id ?? undefined;
    } else if (args.saveName && !costNameId) {
      const resolved = await resolveName(ctx, name, true);
      name = resolved.name;
      costNameId = resolved.id ?? undefined;
    }

    const note = (args.note ?? "").trim();
    await ctx.db.patch(args.id, {
      name,
      costNameId,
      amount: args.amount,
      spentAt: args.spentAt ?? cost.spentAt,
      note: note ? note : undefined,
    });
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("costs") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const cost = await ctx.db.get(args.id);
    if (!cost) return;
    /*
      The name's usage count follows the ledger down. Left alone, deleting a
      mistyped cost would leave its name ranked above names actually in use.
    */
    if (cost.costNameId) {
      const nameRow = await ctx.db.get(cost.costNameId);
      if (nameRow) {
        await ctx.db.patch(cost.costNameId, {
          usageCount: Math.max(0, nameRow.usageCount - 1),
        });
      }
    }
    await ctx.db.delete(args.id);
  },
});
