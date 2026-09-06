import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";

/*
  Passcode gate.

  What is stored:
    - a PBKDF2-SHA256 derivation of the passcode, with a random per-install
      salt. The passcode itself never touches the database or a log.
    - for each session, the SHA-256 hash of the token. The token is returned
      to the browser once and never stored, so leaking this table does not
      let anyone log in.

  Verification happens here, on the server. The gate is not a UI trick: every
  data function in this deployment calls `requireSession`, because Convex
  functions are public HTTP endpoints and a client-side check would protect
  nothing.
*/

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // one day
const PBKDF2_ITERATIONS = 210_000; // OWASP guidance for PBKDF2-SHA256
const MIN_PASSCODE_LENGTH = 6;

// Brute-force throttle. Global rather than per-IP: Convex does not surface a
// client address, and this is a single-tenant dashboard.
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;

/* ------------------------------------------------------------ primitives */

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns an ArrayBuffer, which is what SubtleCrypto's BufferSource wants. */
function fromHex(hex: string): ArrayBuffer {
  const buffer = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return buffer;
}

async function derive(passcode: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

/** Constant-time string compare, so a wrong guess cannot be timed. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* --------------------------------------------------------- session guard */

/**
 * Throws unless `token` maps to a live session. Every data function calls
 * this. Exported for use across the other Convex modules.
 */
export async function requireSession(ctx: QueryCtx | MutationCtx, token: string) {
  if (!token) throw new ConvexError("Not signed in.");
  const tokenHash = await sha256Hex(token);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();

  if (!session) throw new ConvexError("Not signed in.");
  if (session.expiresAt <= Date.now()) throw new ConvexError("Session expired.");
  return session;
}

/* ---------------------------------------------------------------- public */

/** Whether a passcode has been set yet, so the client knows which screen to show. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("authConfig").first();
    return { configured: config !== null };
  },
});

/** Validates a stored token without throwing, for the client's boot check. */
export const validate = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token) return { valid: false as const };
    const tokenHash = await sha256Hex(args.token);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!session || session.expiresAt <= Date.now()) return { valid: false as const };
    return { valid: true as const, expiresAt: session.expiresAt };
  },
});

async function issueSession(ctx: MutationCtx) {
  // Opportunistic cleanup of anything already expired.
  const stale = await ctx.db
    .query("sessions")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
    .take(50);
  for (const s of stale) await ctx.db.delete(s._id);

  const token = randomHex(32);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await ctx.db.insert("sessions", {
    tokenHash: await sha256Hex(token),
    createdAt: Date.now(),
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * First-run setup. Only works while no passcode exists; after that the
 * passcode can only be changed through `change`, which requires the current one.
 */
export const setup = mutation({
  args: { passcode: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("authConfig").first();
    if (existing) throw new ConvexError("A passcode is already set.");
    if (args.passcode.length < MIN_PASSCODE_LENGTH) {
      throw new ConvexError(`Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`);
    }

    const saltHex = randomHex(16);
    await ctx.db.insert("authConfig", {
      saltHex,
      hashHex: await derive(args.passcode, saltHex, PBKDF2_ITERATIONS),
      iterations: PBKDF2_ITERATIONS,
      updatedAt: Date.now(),
    });
    return await issueSession(ctx);
  },
});

export const login = mutation({
  args: { passcode: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db.query("authConfig").first();
    if (!config) throw new ConvexError("No passcode has been set yet.");

    // Throttle: count recent failures, and drop ones outside the window.
    const since = Date.now() - FAILURE_WINDOW_MS;
    const recent = await ctx.db
      .query("loginFailures")
      .withIndex("by_at", (q) => q.gte("at", since))
      .collect();
    if (recent.length >= MAX_FAILURES) {
      const retryInMin = Math.ceil((recent[0].at + FAILURE_WINDOW_MS - Date.now()) / 60000);
      throw new ConvexError(`Too many attempts. Try again in ${Math.max(1, retryInMin)} minutes.`);
    }

    const candidate = await derive(args.passcode, config.saltHex, config.iterations);
    if (!timingSafeEqual(candidate, config.hashHex)) {
      await ctx.db.insert("loginFailures", { at: Date.now() });
      throw new ConvexError("Incorrect passcode.");
    }

    // Success clears the failure log.
    for (const f of recent) await ctx.db.delete(f._id);
    return await issueSession(ctx);
  },
});

export const change = mutation({
  args: { currentPasscode: v.string(), newPasscode: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db.query("authConfig").first();
    if (!config) throw new ConvexError("No passcode has been set yet.");
    if (args.newPasscode.length < MIN_PASSCODE_LENGTH) {
      throw new ConvexError(`Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`);
    }

    const candidate = await derive(args.currentPasscode, config.saltHex, config.iterations);
    if (!timingSafeEqual(candidate, config.hashHex)) {
      await ctx.db.insert("loginFailures", { at: Date.now() });
      throw new ConvexError("Current passcode is incorrect.");
    }

    const saltHex = randomHex(16);
    await ctx.db.patch(config._id, {
      saltHex,
      hashHex: await derive(args.newPasscode, saltHex, PBKDF2_ITERATIONS),
      iterations: PBKDF2_ITERATIONS,
      updatedAt: Date.now(),
    });

    // Changing the passcode invalidates every existing session, including
    // any an attacker might be holding.
    for (const s of await ctx.db.query("sessions").collect()) await ctx.db.delete(s._id);
    return await issueSession(ctx);
  },
});

/**
 * Forgotten-passcode recovery. Internal, so it is unreachable from the
 * browser — running it requires the Convex admin credentials on your machine:
 *
 *   npx convex run auth:reset
 *
 * Afterwards the app shows the first-run setup screen again. Product and sale
 * data is untouched.
 */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("authConfig").first();
    if (config) await ctx.db.delete(config._id);
    let sessions = 0;
    for (const s of await ctx.db.query("sessions").collect()) {
      await ctx.db.delete(s._id);
      sessions++;
    }
    for (const f of await ctx.db.query("loginFailures").collect()) await ctx.db.delete(f._id);
    return `Passcode cleared. Revoked ${sessions} session(s). Set a new one in the app.`;
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token) return;
    const tokenHash = await sha256Hex(args.token);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});
