import { mutation, query, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireSession, verifyPasscode } from "./auth";
import { rememberCustomer } from "./customers";

/*
  Orders.

  An order is what arrives over WhatsApp: a customer, several products,
  quantities and a total. Confirming one writes a sale per line item, so the
  Dashboard, Profit page and Sales ledger keep working exactly as before and
  include order revenue. Without that, orders would be a second set of books
  the profit figures quietly ignore.

  Money is recomputed from the items on every write. A client that sent a
  total disagreeing with its own line items would otherwise be believed.
*/

export const DEFAULT_UNIT = "পিস";

const itemInput = v.object({
  productId: v.id("products"),
  quantity: v.number(),
  unitPrice: v.number(),
});

type Totals = { subtotal: number; total: number };

function computeTotals(
  items: { quantity: number; unitPrice: number }[],
  discount: number,
  deliveryCharge: number,
): Totals {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  return { subtotal, total: subtotal - discount + deliveryCharge };
}

/** Sequential, gap-free order numbers: ORD-000001. */
async function nextOrderNo(ctx: MutationCtx) {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", "order"))
    .unique();
  const next = (row?.value ?? 0) + 1;
  if (row) await ctx.db.patch(row._id, { value: next });
  else await ctx.db.insert("counters", { name: "order", value: next });
  return `ORD-${String(next).padStart(6, "0")}`;
}

function validate(
  items: { quantity: number; unitPrice: number }[],
  discount: number,
  deliveryCharge: number,
) {
  if (items.length === 0) throw new ConvexError("An order needs at least one product.");
  for (const i of items) {
    if (!Number.isFinite(i.quantity) || i.quantity <= 0) {
      throw new ConvexError("Every line needs a quantity above zero.");
    }
    if (!Number.isFinite(i.unitPrice) || i.unitPrice < 0) {
      throw new ConvexError("Unit price cannot be negative.");
    }
  }
  if (!Number.isFinite(discount) || discount < 0) throw new ConvexError("Discount cannot be negative.");
  if (!Number.isFinite(deliveryCharge) || deliveryCharge < 0) {
    throw new ConvexError("Delivery charge cannot be negative.");
  }
  const { subtotal } = computeTotals(items, discount, deliveryCharge);
  if (discount > subtotal) throw new ConvexError("Discount is larger than the order subtotal.");
}

/**
 * Resolves each line against its product, snapshotting the name, unit and
 * cost. Returns which lines exceed available stock so the caller can decide
 * whether that needs an override.
 */
async function resolveItems(ctx: MutationCtx, items: { productId: Id<"products">; quantity: number; unitPrice: number }[]) {
  const resolved = [];
  const short: string[] = [];
  for (const line of items) {
    const product = await ctx.db.get(line.productId);
    if (!product) throw new ConvexError("A product on this order no longer exists.");
    if (line.quantity > product.quantity) {
      short.push(
        `${product.name}: ${line.quantity} requested, ${product.quantity} ${product.unit ?? DEFAULT_UNIT} available`,
      );
    }
    resolved.push({
      productId: line.productId,
      productName: product.name,
      quantity: line.quantity,
      unit: product.unit ?? DEFAULT_UNIT,
      unitPrice: line.unitPrice,
      unitCost: product.costPrice,
    });
  }
  return { resolved, short };
}

/* ------------------------------------------------------------------ read */

export const list = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const q = ctx.db.query("orders").withIndex("by_orderedAt").order("desc");
    return args.limit ? await q.take(args.limit) : await q.collect();
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("orders") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    return await ctx.db.get(args.id);
  },
});

/* ----------------------------------------------------------------- write */

export const create = mutation({
  args: {
    token: v.string(),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    orderedAt: v.optional(v.number()),
    items: v.array(itemInput),
    discount: v.optional(v.number()),
    deliveryCharge: v.optional(v.number()),
    paymentStatus: v.optional(v.string()),
    paidAmount: v.optional(v.number()),
    note: v.optional(v.string()),
    /*
      Selling more than is in stock is allowed, but only deliberately: the
      caller must re-enter the passcode. That stops an oversell happening by
      reflex while still permitting it when stock counts have drifted or goods
      are on the way.
    */
    overridePasscode: v.optional(v.string()),
    /** The tick: keep this customer in the address book for next time. */
    saveCustomer: v.optional(v.boolean()),
    /*
      Whether the goods have already gone. A counter sale is complete the
      moment it is written, and making the shopkeeper confirm it afterwards
      would leave stock wrong for as long as they forgot to.
    */
    completed: v.optional(v.boolean()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    if (!args.customerName.trim()) throw new ConvexError("Customer name is required.");

    const discount = args.discount ?? 0;
    const deliveryCharge = args.deliveryCharge ?? 0;
    validate(args.items, discount, deliveryCharge);

    const { resolved, short } = await resolveItems(ctx, args.items);
    if (short.length > 0) {
      if (!args.overridePasscode) {
        throw new ConvexError(
          `Not enough stock — ${short.join("; ")}. Re-enter your passcode to sell anyway.`,
        );
      }
      await verifyPasscode(ctx, args.overridePasscode);
    }

    const { subtotal, total } = computeTotals(resolved, discount, deliveryCharge);
    const paymentStatus = (args.paymentStatus ?? "due") as "paid" | "due" | "partial";
    const orderedAt = args.orderedAt ?? Date.now();

    /*
      Remembering the customer rides along with the order rather than being a
      second call from the client: an order that was placed but whose customer
      was not remembered — or the reverse — is a state worth making impossible.
    */
    await rememberCustomer(
      ctx,
      {
        name: args.customerName,
        phone: args.customerPhone,
        address: args.customerAddress,
      },
      args.saveCustomer ?? false,
      orderedAt,
    );

    const id = await ctx.db.insert("orders", {
      orderNo: await nextOrderNo(ctx),
      customerName: args.customerName.trim(),
      customerPhone: args.customerPhone?.trim() || undefined,
      customerAddress: args.customerAddress?.trim() || undefined,
      orderedAt,
      items: resolved,
      subtotal,
      discount,
      deliveryCharge,
      total,
      paymentStatus,
      paidAmount: args.paidAmount,
      orderStatus: "pending",
      note: args.note?.trim() || undefined,
      source: args.source,
      createdAt: Date.now(),
    });

    // Stock was already checked above, override included, so fulfilment here
    // cannot fail on a shortage the caller was not told about.
    if (args.completed) await fulfil(ctx, id);
    return id;
  },
});

/**
 * Takes the stock and writes one sale per line, then marks the sale confirmed.
 *
 * Shared by confirming later and by recording a sale that is already complete
 * — a walk-in customer paying at the counter should not have to be confirmed
 * as a second step. Stock availability is the caller's business: both callers
 * check it, and only they know whether an override was given.
 */
async function fulfil(ctx: MutationCtx, id: Id<"orders">) {
  const order = await ctx.db.get(id);
  if (!order) throw new ConvexError("That sale no longer exists.");

  const discountRatio = order.subtotal > 0 ? order.discount / order.subtotal : 0;
  const saleIds: Id<"sales">[] = [];

  for (const line of order.items) {
    const product = await ctx.db.get(line.productId);
    if (product) {
      await ctx.db.patch(line.productId, { quantity: product.quantity - line.quantity });
    }
    const effectivePrice = line.unitPrice * (1 - discountRatio);
    saleIds.push(
      await ctx.db.insert("sales", {
        productId: line.productId,
        productName: line.productName,
        unitCost: line.unitCost,
        unitPrice: effectivePrice,
        quantity: line.quantity,
        buyer: order.customerName,
        note: `${order.orderNo}${order.note ? ` · ${order.note}` : ""}`,
        soldAt: order.orderedAt,
      }),
    );
  }

  await ctx.db.patch(id, { orderStatus: "confirmed", saleIds });
  return saleIds;
}

/**
 * Confirms an order: takes the stock and writes one sale per line.
 *
 * The discount is spread across lines in proportion to their value, so the
 * profit recorded against each product reflects what was actually charged.
 * The delivery charge is deliberately excluded — it is a pass-through, not
 * product revenue, and folding it in would inflate margins.
 */
export const confirm = mutation({
  args: { token: v.string(), id: v.id("orders"), overridePasscode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("That order no longer exists.");
    if (order.orderStatus === "confirmed" || order.orderStatus === "delivered") {
      throw new ConvexError("This order is already confirmed.");
    }
    if (order.orderStatus === "cancelled") throw new ConvexError("This order was cancelled.");

    const short: string[] = [];
    for (const line of order.items) {
      const product = await ctx.db.get(line.productId);
      if (product && line.quantity > product.quantity) {
        short.push(`${line.productName}: only ${product.quantity} left`);
      }
    }
    if (short.length > 0) {
      if (!args.overridePasscode) {
        throw new ConvexError(
          `Not enough stock — ${short.join("; ")}. Re-enter your passcode to confirm anyway.`,
        );
      }
      await verifyPasscode(ctx, args.overridePasscode);
    }

    const saleIds = await fulfil(ctx, args.id);
    return { saleIds: saleIds.length };
  },
});

/** Cancels a confirmed order: removes its sales and returns the stock. */
export const cancel = mutation({
  args: { token: v.string(), id: v.id("orders") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("That order no longer exists.");
    if (order.orderStatus === "cancelled") return;

    for (const saleId of order.saleIds ?? []) {
      const sale = await ctx.db.get(saleId);
      if (!sale) continue;
      const product = await ctx.db.get(sale.productId);
      if (product) {
        await ctx.db.patch(sale.productId, { quantity: product.quantity + sale.quantity });
      }
      await ctx.db.delete(saleId);
    }
    await ctx.db.patch(args.id, { orderStatus: "cancelled", saleIds: [] });
  },
});

/**
 * Records what the customer has actually paid.
 *
 * Status and amount are kept consistent with each other rather than being two
 * independent fields: "paid" always means the full total, "due" always means
 * nothing, and "partial" must be strictly between the two. Letting them drift
 * apart is how an order ends up marked paid with ৳0 against it.
 */
export const setPayment = mutation({
  args: {
    token: v.string(),
    id: v.id("orders"),
    paymentStatus: v.union(v.literal("paid"), v.literal("due"), v.literal("partial")),
    paidAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("That order no longer exists.");

    let paidAmount: number;
    if (args.paymentStatus === "paid") {
      paidAmount = order.total;
    } else if (args.paymentStatus === "due") {
      paidAmount = 0;
    } else {
      const amount = args.paidAmount ?? 0;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ConvexError("Enter how much has been paid.");
      }
      if (amount >= order.total) {
        throw new ConvexError(
          `That is the full amount — mark the order paid instead of partial.`,
        );
      }
      paidAmount = amount;
    }

    await ctx.db.patch(args.id, { paymentStatus: args.paymentStatus, paidAmount });
    return { paidAmount, due: order.total - paidAmount };
  },
});

export const setStatus = mutation({
  args: {
    token: v.string(),
    id: v.id("orders"),
    paymentStatus: v.optional(v.string()),
    orderStatus: v.optional(v.string()),
    paidAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const patch: Record<string, unknown> = {};
    if (args.paymentStatus) patch.paymentStatus = args.paymentStatus;
    if (args.paidAmount !== undefined) patch.paidAmount = args.paidAmount;
    // Confirming and cancelling move stock, so they go through their own
    // mutations rather than being settable here.
    if (args.orderStatus === "delivered" || args.orderStatus === "pending") {
      patch.orderStatus = args.orderStatus;
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("orders") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const order = await ctx.db.get(args.id);
    if (!order) return;
    // Deleting a confirmed order must not leave its sales behind.
    for (const saleId of order.saleIds ?? []) {
      const sale = await ctx.db.get(saleId);
      if (!sale) continue;
      const product = await ctx.db.get(sale.productId);
      if (product) {
        await ctx.db.patch(sale.productId, { quantity: product.quantity + sale.quantity });
      }
      await ctx.db.delete(saleId);
    }
    await ctx.db.delete(args.id);
  },
});
