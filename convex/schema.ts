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
    quantity: v.number(),
    unitCost: v.number(),
    unitPrice: v.number(),
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

  products: defineTable({
    name: v.string(),
    // What it costs you to acquire one unit.
    costPrice: v.number(),
    details: v.string(),
    category: v.optional(v.string()),
    // Units currently on hand.
    quantity: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_archived", ["archived"]),

  sales: defineTable({
    productId: v.id("products"),
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
