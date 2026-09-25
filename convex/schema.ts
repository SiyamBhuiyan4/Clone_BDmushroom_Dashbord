import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /*
    Single-row table holding the passcode verifier. The passcode itself is
    never stored — only a PBKDF2-SHA256 derivation of it, with a per-install
    random salt. Changing the iteration count is safe: existing rows carry
    the count they were written with.
  */
  authConfig: defineTable({
    saltHex: v.string(),
    hashHex: v.string(),
    iterations: v.number(),
    updatedAt: v.number(),
  }),

  /*
    Issued sessions. The token handed to the browser is never stored either —
    only its SHA-256 hash, so a dump of this table cannot be replayed as a
    login.
  */
  sessions: defineTable({
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_expiresAt", ["expiresAt"]),

  /*
    A customer order, as taken over WhatsApp.

    Items are embedded rather than a separate table: an order is always read
    and written whole, and embedding keeps the line items and the totals they
    produce in one atomic record.

    `unitCost` is snapshotted per line for the same reason sales snapshot it —
    so repricing a product later cannot rewrite the profit of an order that
    has already been fulfilled.
  */
  orders: defineTable({
    orderNo: v.string(),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    orderedAt: v.number(),
    items: v.array(
      v.object({
        productId: v.id("products"),
        productName: v.string(),
        quantity: v.number(),
        unit: v.string(),
        unitPrice: v.number(),
        unitCost: v.number(),
        /*
          The purchase lot this line was sold from, when one was picked. The
          cost above is still the figure that counts — it is snapshotted the
          moment the sale is made — but the link is what lets the lot's
          remaining stock be put back if the sale is cancelled.
        */
        batchId: v.optional(v.id("stockBatches")),
      }),
    ),
    subtotal: v.number(),
    discount: v.number(),
    deliveryCharge: v.number(),
    total: v.number(),
    paymentStatus: v.union(v.literal("paid"), v.literal("due"), v.literal("partial")),
    paidAmount: v.optional(v.number()),
    orderStatus: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("delivered"),
      v.literal("cancelled"),
    ),
    note: v.optional(v.string()),
    /*
      The status a cancellation was made from, so undoing one puts the sale
      back where it was rather than guessing. A cancelled pending order and a
      cancelled confirmed order look identical afterwards — both are
      "cancelled" with no sales against them — and only one of them should
      take stock again when it is restored.
    */
    cancelledFrom: v.optional(
      v.union(v.literal("pending"), v.literal("confirmed"), v.literal("delivered")),
    ),
    /*
      Sales written when the order was confirmed. Confirming an order records
      one sale per line, so the Dashboard, Profit and Sales ledger keep working
      unchanged and include order revenue — without this, orders would be a
      second set of books the profit figures ignore.
    */
    saleIds: v.optional(v.array(v.id("sales"))),
    source: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_orderedAt", ["orderedAt"])
    .index("by_orderNo", ["orderNo"])
    .index("by_status", ["orderStatus"]),

  /** Monotonic counters, so order numbers never collide. */
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  /** Failed login timestamps, for throttling brute force. */
  loginFailures: defineTable({
    at: v.number(),
  }).index("by_at", ["at"]),

  /*
    Rows removed through an erase action are copied here first. Nothing in the
    app reads this table — it exists so a mistake is recoverable from the CLI,
    not so the interface can offer an undo. `batchId` groups one erase, which
    is the unit a restore works on.
  */
  archive: defineTable({
    table: v.string(),
    originalId: v.string(),
    data: v.any(),
    archivedAt: v.number(),
    batchId: v.string(),
    reason: v.string(),
  })
    .index("by_archivedAt", ["archivedAt"])
    .index("by_batch", ["batchId"]),

  /*
    A purchase lot ("ষ্টক"). Profit is always derived as
    (unitPrice - unitCost) * quantity rather than stored, so a lot can never
    disagree with its own arithmetic.
  */
  stockBatches: defineTable({
    productId: v.id("products"),
    productName: v.string(),
    label: v.string(),
    purchasedAt: v.number(),
    /** How many were bought. */
    quantity: v.number(),
    /*
      How many of them are left. Optional because lots recorded before this
      existed have never been drawn from — those fall back to the full
      quantity, which is exactly what they have left.
    */
    remaining: v.optional(v.number()),
    unitCost: v.number(),
    /*
      What you expect to get for one. Optional: plenty of stock is bought
      without a price decided yet, and a lot that has to invent one in order
      to be recorded would put a made-up figure into the profit projection.
    */
    unitPrice: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_purchasedAt", ["purchasedAt"])
    .index("by_product", ["productId"]),

  /*
    How each taka of profit is divided. Percentages are validated to total
    100 on write, so the split can never silently lose or invent money.
  */
  allocationBuckets: defineTable({
    name: v.string(),
    nameBn: v.string(),
    percent: v.number(),
    order: v.number(),
  }).index("by_order", ["order"]),

  /*
    A cost the business carried that is not the price of stock — office
    snacks, van fuel, the electricity bill. Kept apart from `stockBatches`
    on purpose: a lot's cost is recovered when its units sell, and an
    operating cost never is. Mixing the two would make margin meaningless.
  */
  costs: defineTable({
    /*
      The name is copied onto the row rather than only referenced, for the
      same reason a sale snapshots its product name: renaming or deleting a
      saved name later must not rewrite what an old receipt said.
    */
    name: v.string(),
    /** Set when the name was picked from the saved list rather than typed. */
    costNameId: v.optional(v.id("costNames")),
    amount: v.number(),
    spentAt: v.number(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_spentAt", ["spentAt"])
    .index("by_costName", ["costNameId"]),

  /*
    A cost name the shop expects to use again — "Office snacks", "Van fuel".
    Saving one is what stops the same expense being typed three ways and
    landing in a report as three separate things.

    `key` is the lowercased, space-collapsed name, so the check for "have we
    got this one already" is an index lookup rather than a scan that misses
    on a stray capital.
  */
  costNames: defineTable({
    name: v.string(),
    key: v.string(),
    /** How many costs have used it — the pick list is ordered by this. */
    usageCount: v.number(),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_usage", ["usageCount"]),

  /*
    A customer the shop expects to see again. Saved from an order with the
    tick on, searched and picked the next time rather than retyped.

    Identity is the phone number when there is one — two people called Rifat
    are two customers, one phone number is one person — and the name only
    when there is not. A customer first saved without a phone and later with
    one therefore becomes two records; that is honest rather than clever,
    since merging them would mean guessing which Rifat placed which order.
  */
  customers: defineTable({
    name: v.string(),
    phone: v.optional(v.string()),
    /*
      How you actually reach them. Kept apart from `phone` because the number
      that identifies a customer and the number you message are not always the
      same one, and because a shop that sells over WhatsApp needs the second
      even when it has the first.
    */
    whatsapp: v.optional(v.string()),
    facebookUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    /** Digits of the phone, else the lowercased name. */
    key: v.string(),
    orderCount: v.number(),
    lastOrderedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_orders", ["orderCount"]),

  products: defineTable({
    name: v.string(),
    // What it costs you to acquire one unit.
    costPrice: v.number(),
    /*
      Default selling price, so picking a product on an order fills the price
      in. Optional because products created before orders existed have none.
    */
    sellPrice: v.optional(v.number()),
    /*
      What a "unit" means for this product — পিস, কেজি, গ্রাম, লিটার. Without
      it, stock totals add 2.5 kg of agar to 50 fogger nozzles.
    */
    unit: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    details: v.string(),
    category: v.optional(v.string()),
    // Units currently on hand.
    quantity: v.number(),
    /** Per-product low-stock threshold; falls back to a global default. */
    reorderLevel: v.optional(v.number()),
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_archived", ["archived"]),

  sales: defineTable({
    productId: v.id("products"),
    /** The purchase lot this sale drew from, when one was picked. */
    batchId: v.optional(v.id("stockBatches")),
    // Name and cost are snapshotted so history stays correct if the
    // product is later renamed, repriced, or deleted.
    productName: v.string(),
    unitCost: v.number(),
    unitPrice: v.number(),
    quantity: v.number(),
    buyer: v.optional(v.string()),
    note: v.optional(v.string()),
    soldAt: v.number(),
  })
    .index("by_soldAt", ["soldAt"])
    .index("by_product", ["productId"]),
});
