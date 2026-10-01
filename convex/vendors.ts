import { mutation, query, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireSession, verifyPasscode } from "./auth";
import { VENDOR_CATEGORIES, type VendorCategory } from "./shared";

/*
  Suppliers — who the shop buys stock from. The mirror image of `customers`,
  but with a fixed category (there are only a handful of real supplier roles
  in a mushroom business) and a media gallery (TIN, trade license, receipts)
  that a stock lot can point into without ever copying a file twice.
*/

/** Every vendor starts with these — renameable and deletable like any other folder. */
const STARTER_FOLDERS = ["TIN & Trade License", "Receipts", "Video"];

export const list = query({
  args: { token: v.string(), category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const rows = args.category
      ? await ctx.db
          .query("vendors")
          .withIndex("by_category", (q) => q.eq("category", args.category as VendorCategory))
          .collect()
      : await ctx.db.query("vendors").collect();
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("vendors") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    return await ctx.db.get(args.id);
  },
});

/**
 * A vendor's whole profile: their info, their folders, every file in their
 * gallery (grouped by folder, with a signed URL each), and the lots bought
 * from them — so "what have I actually bought from this person" is one
 * screen instead of hunting through every product.
 */
export const detail = query({
  args: { token: v.string(), id: v.id("vendors") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const vendor = await ctx.db.get(args.id);
    if (!vendor) return null;

    const [folders, media, lots] = await Promise.all([
      ctx.db
        .query("vendorFolders")
        .withIndex("by_vendor", (q) => q.eq("vendorId", args.id))
        .collect(),
      ctx.db
        .query("vendorMedia")
        .withIndex("by_vendor", (q) => q.eq("vendorId", args.id))
        .collect(),
      ctx.db
        .query("stockBatches")
        .withIndex("by_vendor", (q) => q.eq("vendorId", args.id))
        .collect(),
    ]);

    const mediaWithUrl = await Promise.all(
      media.map(async (m) => ({
        _id: m._id,
        folderId: m.folderId ?? null,
        kind: m.kind,
        fileName: m.fileName,
        createdAt: m.createdAt,
        url: await ctx.storage.getUrl(m.storageId),
      })),
    );

    return {
      vendor,
      folders: [...folders].sort((a, b) => a.createdAt - b.createdAt),
      media: mediaWithUrl,
      lots: [...lots].sort((a, b) => b.purchasedAt - a.purchasedAt),
    };
  },
});

function validate(name: string, category: string) {
  if (!name.trim()) throw new ConvexError("A vendor needs a name.");
  if (!(VENDOR_CATEGORIES as readonly string[]).includes(category)) {
    throw new ConvexError("Not a known vendor category.");
  }
}

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    category: v.string(),
    phone: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    address: v.optional(v.string()),
    tin: v.optional(v.string()),
    tradeLicenseNo: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    validate(args.name, args.category);
    const now = Date.now();
    const id = await ctx.db.insert("vendors", {
      name: args.name.trim(),
      category: args.category as VendorCategory,
      phone: args.phone?.trim() || undefined,
      whatsapp: args.whatsapp?.trim() || undefined,
      address: args.address?.trim() || undefined,
      tin: args.tin?.trim() || undefined,
      tradeLicenseNo: args.tradeLicenseNo?.trim() || undefined,
      note: args.note?.trim() || undefined,
      createdAt: now,
    });
    for (const name of STARTER_FOLDERS) {
      await ctx.db.insert("vendorFolders", { vendorId: id, name, createdAt: now });
    }
    return id;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("vendors"),
    name: v.string(),
    category: v.string(),
    phone: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    address: v.optional(v.string()),
    tin: v.optional(v.string()),
    tradeLicenseNo: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That vendor no longer exists.");
    validate(args.name, args.category);
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      category: args.category as VendorCategory,
      phone: args.phone?.trim() || undefined,
      whatsapp: args.whatsapp?.trim() || undefined,
      address: args.address?.trim() || undefined,
      tin: args.tin?.trim() || undefined,
      tradeLicenseNo: args.tradeLicenseNo?.trim() || undefined,
      note: args.note?.trim() || undefined,
    });
  },
});

/**
 * Removes a vendor, their folders and every file in their gallery. Lots
 * bought from them are kept — a lot is history, not a record that belongs to
 * the vendor — but the link is cleared since it would otherwise point at
 * nothing.
 */
export const remove = mutation({
  args: { token: v.string(), id: v.id("vendors"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);

    const media = await ctx.db
      .query("vendorMedia")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.id))
      .collect();
    for (const m of media) {
      await ctx.storage.delete(m.storageId);
      await ctx.db.delete(m._id);
    }
    const folders = await ctx.db
      .query("vendorFolders")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.id))
      .collect();
    for (const f of folders) await ctx.db.delete(f._id);

    const lots = await ctx.db
      .query("stockBatches")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.id))
      .collect();
    for (const l of lots) {
      await ctx.db.patch(l._id, { vendorId: undefined, mediaIds: undefined });
    }

    await ctx.db.delete(args.id);
  },
});

/* ----------------------------------------------------------------- folders */

export const createFolder = mutation({
  args: { token: v.string(), vendorId: v.id("vendors"), name: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const name = args.name.trim();
    if (!name) throw new ConvexError("A folder needs a name.");
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError("That vendor no longer exists.");
    return await ctx.db.insert("vendorFolders", {
      vendorId: args.vendorId,
      name,
      createdAt: Date.now(),
    });
  },
});

export const renameFolder = mutation({
  args: { token: v.string(), id: v.id("vendorFolders"), name: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const name = args.name.trim();
    if (!name) throw new ConvexError("A folder needs a name.");
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That folder no longer exists.");
    await ctx.db.patch(args.id, { name });
  },
});

/** Deletes a folder and everything filed in it. */
export const removeFolder = mutation({
  args: { token: v.string(), id: v.id("vendorFolders"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const folder = await ctx.db.get(args.id);
    if (!folder) return;

    const media = await ctx.db
      .query("vendorMedia")
      .withIndex("by_folder", (q) => q.eq("folderId", args.id))
      .collect();
    for (const m of media) {
      await unlinkMediaFromLots(ctx, folder.vendorId, m._id);
      await ctx.storage.delete(m.storageId);
      await ctx.db.delete(m._id);
    }
    await ctx.db.delete(args.id);
  },
});

/* ------------------------------------------------------------------ media */

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Files a freshly uploaded storage object into a vendor's gallery. */
export const attachMedia = mutation({
  args: {
    token: v.string(),
    vendorId: v.id("vendors"),
    folderId: v.optional(v.id("vendorFolders")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    kind: v.union(v.literal("image"), v.literal("video")),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError("That vendor no longer exists.");
    return await ctx.db.insert("vendorMedia", {
      vendorId: args.vendorId,
      folderId: args.folderId,
      storageId: args.storageId,
      kind: args.kind,
      fileName: args.fileName,
      createdAt: Date.now(),
    });
  },
});

async function unlinkMediaFromLots(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  mediaId: Id<"vendorMedia">,
) {
  // Only lots from the same vendor can reference this file, so the scan is
  // bounded to one vendor's purchases rather than the whole ledger.
  const lots = await ctx.db
    .query("stockBatches")
    .withIndex("by_vendor", (q) => q.eq("vendorId", vendorId))
    .collect();
  for (const lot of lots) {
    if (!lot.mediaIds?.includes(mediaId)) continue;
    await ctx.db.patch(lot._id, { mediaIds: lot.mediaIds.filter((m) => m !== mediaId) });
  }
}

/** Deletes a file outright — not just unlinking it from one place it's used. */
export const removeMedia = mutation({
  args: { token: v.string(), id: v.id("vendorMedia"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const row = await ctx.db.get(args.id);
    if (!row) return;
    await unlinkMediaFromLots(ctx, row.vendorId, args.id);
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(args.id);
  },
});
