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

/*
  Recording a failed attempt is the one thing in this file that cannot be done
  on the way out of an error.

  A Convex mutation is a transaction: "All operations within a mutation are
  atomic", and a handler that throws has every write rolled back with it. So
  `insert(loginFailures); throw` — which is what this file used to do in three
  places — records nothing at all. The row is written and discarded together,
  the count never reaches one, and the throttle never fires however many
  guesses arrive.

  The fix is that a guess which must be counted cannot abort. `login` and
  `change` therefore report a wrong passcode by returning a result rather than
  throwing, so the transaction commits with the failure in it. See
  `verifyPasscode` for the case where that trade is not available.
*/

/**
 * Drops failures that have aged out of the window.
 *
 * The lock only ever counts rows inside the window, so these change nothing
 * about who is let in — but now that a failure actually persists, nothing else
 * would ever remove them and the table would grow for the life of the
 * deployment.
 */
async function purgeStaleFailures(ctx: MutationCtx, since: number) {
  const stale = await ctx.db
    .query("loginFailures")
    .withIndex("by_at", (q) => q.lt("at", since))
    .take(200);
  for (const f of stale) await ctx.db.delete(f._id);
}

/** The throttle's verdict, and the rows that would be cleared by a success. */
async function throttleState(ctx: MutationCtx) {
  const now = Date.now();
  const since = now - FAILURE_WINDOW_MS;
  const recent = await ctx.db
    .query("loginFailures")
    .withIndex("by_at", (q) => q.gte("at", since))
    .collect();
  // Index order is ascending, so the first row is the one that ages out next.
  const retryInMin =
    recent.length > 0 ? Math.max(1, Math.ceil((recent[0].at + FAILURE_WINDOW_MS - now) / 60000)) : 0;
  return { now, since, recent, locked: recent.length >= MAX_FAILURES, retryInMin };
}

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

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

/** Constant-time string compare, so a wrong guess cannot be timed. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomHex(bytes: number): string {
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

/**
 * Re-checks the passcode for an action a live session alone should not
 * authorise — a delete, an order confirmation, a range reset.
 *
 * This one *observes* the throttle but cannot add to it. Its whole job is to
 * abort the mutation it was called from, and an abort rolls back every write in
 * that transaction, so a failure recorded here would be discarded along with
 * the delete it prevented. The insert that used to sit on this path was dead
 * code for exactly that reason.
 *
 * So the count comes from `login` and `change`, which can return instead of
 * throwing, and this honours the lock they build. The gap that leaves is
 * narrow: reaching here at all needs a live session, so a stranger cannot use
 * it as an oracle — only someone already signed in, who has the data anyway.
 * Closing it properly means verifying in a mutation of its own and handing the
 * action a short-lived proof, which is a larger change than this comment.
 */
export async function verifyPasscode(ctx: MutationCtx, passcode: string) {
  const config = await ctx.db.query("authConfig").first();
  if (!config) throw new ConvexError("No passcode has been set yet.");

  const { recent, locked } = await throttleState(ctx);
  if (locked) throw new ConvexError("Too many failed attempts. Try again shortly.");

  const candidate = await derive(passcode, config.saltHex, config.iterations);
  if (!timingSafeEqual(candidate, config.hashHex)) {
    throw new ConvexError("Incorrect passcode.");
  }
  // A correct passcode is proof enough to clear the lock, as a login is.
  for (const f of recent) await ctx.db.delete(f._id);
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

export async function issueSession(ctx: MutationCtx) {
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
 * Sets or replaces the passcode. Internal on purpose: there is no public
 * "set a passcode" endpoint, so a stranger reaching a fresh deployment cannot
 * claim it. Running this needs the Convex admin credentials for the
 * deployment — the CLI, or the dashboard's function runner.
 *
 *   npx convex run auth:setPasscode '{"passcode":"your-new-one"}'
 *   npx convex run --prod auth:setPasscode '{"passcode":"your-new-one"}'
 *
 * Every existing session is revoked, so anyone signed in has to enter the new
 * passcode.
 */
export const setPasscode = internalMutation({
  args: { passcode: v.string() },
  handler: async (ctx, args) => {
    if (args.passcode.length < MIN_PASSCODE_LENGTH) {
      throw new ConvexError(`Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`);
    }

    const saltHex = randomHex(16);
    const record = {
      saltHex,
      hashHex: await derive(args.passcode, saltHex, PBKDF2_ITERATIONS),
      iterations: PBKDF2_ITERATIONS,
      updatedAt: Date.now(),
    };

    const existing = await ctx.db.query("authConfig").first();
    if (existing) await ctx.db.patch(existing._id, record);
    else await ctx.db.insert("authConfig", record);

    let revoked = 0;
    for (const s of await ctx.db.query("sessions").collect()) {
      await ctx.db.delete(s._id);
      revoked++;
    }
    for (const f of await ctx.db.query("loginFailures").collect()) await ctx.db.delete(f._id);

    return `Passcode ${existing ? "changed" : "set"}. Revoked ${revoked} session(s).`;
  },
});

/**
 * The passcode half of signing in, against the brute-force throttle.
 *
 * A plain helper rather than a mutation of its own. It used to be the public
 * `auth.login` and the whole of the sign-in; leaving it exported in any form
 * would keep a door open beside the one the emailed code guards, since the
 * passcode alone would still be enough and the email step would be
 * decoration. `otp.completeLogin` calls this, and nothing else does.
 *
 * Calling it directly rather than through `ctx.runMutation` also keeps the
 * writes in the caller's transaction, which is what lets a recorded failure
 * survive — see the note at the top of this file.
 *
 * Returns rather than throws for that same reason: a throw would roll back
 * the attempt it just counted.
 */
export async function attemptPasscode(
  ctx: MutationCtx,
  passcode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = await ctx.db.query("authConfig").first();
  if (!config) throw new ConvexError("No passcode has been set yet.");

  const { now, since, recent, locked, retryInMin } = await throttleState(ctx);
  if (locked) {
    return { ok: false, error: `Too many attempts. Try again in ${retryInMin} minutes.` };
  }

  const candidate = await derive(passcode, config.saltHex, config.iterations);
  if (!timingSafeEqual(candidate, config.hashHex)) {
    await ctx.db.insert("loginFailures", { at: now });
    await purgeStaleFailures(ctx, since);
    return { ok: false, error: "Incorrect passcode." };
  }

  // Success clears the failure log.
  for (const f of recent) await ctx.db.delete(f._id);
  await purgeStaleFailures(ctx, since);
  return { ok: true };
}

/**
 * Changes the passcode.
 *
 * Takes a session token and answers to the same throttle as the login screen.
 * Without both it was a better brute-force target than the login screen it sat
 * beside: a public endpoint that checked the passcode, counted nothing, and
 * required no session — so guesses could be posted at it indefinitely, faster
 * than the front door and without signing in first.
 *
 * A wrong current passcode returns rather than throws, for the same reason
 * login does: a throw takes the record of the attempt with it.
 */
export const change = mutation({
  args: { token: v.string(), currentPasscode: v.string(), newPasscode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const config = await ctx.db.query("authConfig").first();
    if (!config) throw new ConvexError("No passcode has been set yet.");
    if (args.newPasscode.length < MIN_PASSCODE_LENGTH) {
      throw new ConvexError(`Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`);
    }

    const { now, since, recent, locked, retryInMin } = await throttleState(ctx);
    if (locked) {
      return {
        ok: false as const,
        error: `Too many attempts. Try again in ${retryInMin} minutes.`,
      };
    }

    const candidate = await derive(args.currentPasscode, config.saltHex, config.iterations);
    if (!timingSafeEqual(candidate, config.hashHex)) {
      await ctx.db.insert("loginFailures", { at: now });
      await purgeStaleFailures(ctx, since);
      return { ok: false as const, error: "Current passcode is incorrect." };
    }
    for (const f of recent) await ctx.db.delete(f._id);
    await purgeStaleFailures(ctx, since);

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
    const session = await issueSession(ctx);
    return { ok: true as const, token: session.token, expiresAt: session.expiresAt };
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

/**
 * Extends a live session by a fresh day. Called when someone answers the
 * "about to sign out" prompt, so a session cannot lapse mid-form and throw
 * away whatever was typed.
 *
 * Only a session that is still valid can be renewed — an expired token has to
 * go through the passcode again.
 */
export const renew = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.token);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.db.patch(session._id, { expiresAt });
    return { expiresAt };
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
