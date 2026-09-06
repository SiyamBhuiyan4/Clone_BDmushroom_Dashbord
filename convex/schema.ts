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
