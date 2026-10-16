import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { PBKDF2_ITERATIONS, derive, randomHex, sha256Hex, timingSafeEqual } from "./auth";

/*
  Trainee sign-in, apart from the owner's passcode.

  The shop hands each trainee a username and password at the office; there
  is no sign-up. A trainee's session lives in `traineeSessions`, which
  `requireSession` never reads — so a trainee's token opens their own
  courses (portal.ts) and nothing else in the app.
*/

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // a month — trainees should not sign in daily
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;

export const MIN_PASSWORD_LENGTH = 6;

export function normaliseUsername(username: string) {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string) {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new ConvexError("Username: 3–32 letters, numbers, dots, dashes or underscores, no spaces.");
  }
}

export async function hashPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ConvexError(`Password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const salt = randomHex(16);
  return { passwordSalt: salt, passwordHash: await derive(password, salt, PBKDF2_ITERATIONS) };
}

/** Throws unless `token` is a live trainee session; returns that trainee. */
export async function requireTrainee(ctx: QueryCtx | MutationCtx, token: string) {
  if (!token) throw new ConvexError("Not signed in.");
  const tokenHash = await sha256Hex(token);
  const row = await ctx.db
    .query("traineeSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!row || row.expiresAt <= Date.now()) throw new ConvexError("Session expired — sign in again.");
  const trainee = await ctx.db.get(row.traineeId);
  // A trainee deleted, or whose login was removed, is signed out everywhere.
  if (!trainee || !trainee.username) throw new ConvexError("Session expired — sign in again.");
  return trainee;
}

/** Signs a trainee out of every device — on a new password or a removed login. */
export async function endTraineeSessions(ctx: MutationCtx, traineeId: Id<"trainees">) {
  const rows = await ctx.db
    .query("traineeSessions")
    .withIndex("by_trainee", (q) => q.eq("traineeId", traineeId))
    .collect();
  for (const r of rows) await ctx.db.delete(r._id);
}

/*
  A wrong password is reported by returning, not throwing: a mutation that
  throws rolls back every write in it, which would discard the failure count
  and leave the lock unable to ever fire (the same trap auth.ts describes).
*/
export const login = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const username = normaliseUsername(args.username);
    const trainee = username
      ? await ctx.db
          .query("trainees")
          .withIndex("by_username", (q) => q.eq("username", username))
          .unique()
      : null;
    const wrong = { ok: false as const, error: "Wrong username or password." };
    if (!trainee || !trainee.passwordHash || !trainee.passwordSalt) return wrong;

    const now = Date.now();
    if (trainee.lockedUntil && trainee.lockedUntil > now) {
      const minutes = Math.ceil((trainee.lockedUntil - now) / 60_000);
      return { ok: false as const, error: `Too many wrong tries — try again in ${minutes} min.` };
    }

    const hash = await derive(args.password, trainee.passwordSalt, PBKDF2_ITERATIONS);
    if (!timingSafeEqual(hash, trainee.passwordHash)) {
      const failures = (trainee.loginFailures ?? 0) + 1;
      await ctx.db.patch(trainee._id, {
        loginFailures: failures >= MAX_FAILURES ? 0 : failures,
        lockedUntil: failures >= MAX_FAILURES ? now + LOCK_MS : trainee.lockedUntil,
      });
      return wrong;
    }

    await ctx.db.patch(trainee._id, { loginFailures: 0, lockedUntil: undefined });
    const token = randomHex(32);
    const expiresAt = now + SESSION_TTL_MS;
    await ctx.db.insert("traineeSessions", {
      traineeId: trainee._id,
      tokenHash: await sha256Hex(token),
      createdAt: now,
      expiresAt,
    });
    return { ok: true as const, token, expiresAt };
  },
});

/** Who is signed in — never throws, so the portal can tell "signed out" from an error. */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    try {
      const trainee = await requireTrainee(ctx, args.token);
      const photoUrl = trainee.photoId ? await ctx.storage.getUrl(trainee.photoId) : null;
      return { valid: true as const, name: trainee.name, photoUrl };
    } catch {
      return { valid: false as const };
    }
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.token);
    const row = await ctx.db
      .query("traineeSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
