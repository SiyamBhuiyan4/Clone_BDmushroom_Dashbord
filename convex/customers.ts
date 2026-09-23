import { mutation, query, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireSession, verifyPasscode } from "./auth";
import { customerKey } from "./shared";

/*
  The shop's address book.

  Same idea as the saved cost names: an order typed from scratch every time
  produces "Rifat", "Md. Rifat" and "রিফাত ভাই" as three customers with one
  order each, and the shop loses the ability to answer "what does this person
  usually buy". Ticking "save this customer" on an order keeps the details;
  from then on the name field searches them and picking one fills the phone
  and address in.

  Unlike cost names there are no examples to offer. Cost names are the same
  in every shop; customers are not, and inventing plausible people would put
  names in the address book that never bought anything.
*/

/**
 * Records that this customer placed an order, saving them if asked.
 *
 * Details are refreshed from the order when it carries them: a customer who
 * has moved is more usefully remembered at the new address than the old one,
 * and the order itself keeps its own snapshot either way, so history is not
 * touched by this.
 *
 * Called from `orders.create` rather than the client, so remembering a
 * customer and recording their order either both happen or neither does.
 */
export async function rememberCustomer(
  ctx: MutationCtx,
  details: { name: string; phone?: string; address?: string },
  save: boolean,
  orderedAt: number,
) {
  const name = details.name.trim();
  if (!name) return;
  const phone = details.phone?.trim() || undefined;
  const address = details.address?.trim() || undefined;
  const key = customerKey(name, phone);

  const existing = await ctx.db
    .query("customers")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (existing) {
    // Ordering again ranks a customer up the pick list, tick or no tick.
    await ctx.db.patch(existing._id, {
      name,
      phone: phone ?? existing.phone,
      address: address ?? existing.address,
      orderCount: existing.orderCount + 1,
      lastOrderedAt: orderedAt,
    });
    return;
  }
  if (!save) return;

  await ctx.db.insert("customers", {
    name,
    phone,
    address,
    key,
    orderCount: 1,
    lastOrderedAt: orderedAt,
    createdAt: Date.now(),
  });
}

/** The address book, most frequent first. */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const rows = await ctx.db.query("customers").collect();
    return rows
      .sort((a, b) => b.orderCount - a.orderCount || a.name.localeCompare(b.name))
      .map((c) => ({
        _id: c._id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        orderCount: c.orderCount,
        lastOrderedAt: c.lastOrderedAt,
      }));
  },
});

/**
 * Adds a customer by hand, without waiting for them to buy something.
 *
 * The address book is worth filling in before the first sale — a shop knows
 * its regulars before it has recorded an order for each of them, and typing
 * the details once here is the whole point of the list.
 */
export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const name = args.name.trim();
    if (!name) throw new ConvexError("A customer needs a name.");

    const phone = args.phone?.trim() || undefined;
    const key = customerKey(name, phone);
    const clash = await ctx.db
      .query("customers")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (clash) {
      throw new ConvexError(
        phone
          ? `${clash.name} is already saved with that number.`
          : `${clash.name} is already saved.`,
      );
    }

    return await ctx.db.insert("customers", {
      name,
      phone,
      address: args.address?.trim() || undefined,
      key,
      // Added by hand, so nothing has been bought under this name yet.
      orderCount: 0,
      createdAt: Date.now(),
    });
  },
});

/**
 * Corrects a saved customer's details. Orders already placed keep the name
 * and address they were placed under — a receipt has to keep saying what it
 * said when it was printed.
 */
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("customers"),
    name: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That customer is no longer saved.");
    const name = args.name.trim();
    if (!name) throw new ConvexError("A customer needs a name.");

    const phone = args.phone?.trim() || undefined;
    const key = customerKey(name, phone);
    if (key !== row.key) {
      const clash = await ctx.db
        .query("customers")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (clash && clash._id !== args.id) {
        throw new ConvexError(`${clash.name} is already saved with that number.`);
      }
    }

    await ctx.db.patch(args.id, {
      name,
      phone,
      address: args.address?.trim() || undefined,
      key,
    });
  },
});

/**
 * Removes a customer from the address book. Their orders are untouched — this
 * is a pick list, not the ledger.
 *
 * Passcode-gated like every other delete: a live session means an unlocked
 * browser, not a decision.
 */
export const remove = mutation({
  args: { token: v.string(), id: v.id("customers"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const row = await ctx.db.get(args.id);
    if (!row) return;
    await ctx.db.delete(args.id);
  },
});
