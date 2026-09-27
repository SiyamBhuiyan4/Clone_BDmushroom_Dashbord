import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import {
  attemptPasscode,
  issueSession,
  randomHex,
  requireSession,
  sha256Hex,
  timingSafeEqual,
} from "./auth";

/*
  The way back in after too many wrong passcodes.

  Signing in is normally the passcode alone. Five wrong ones in the window and
  `auth.login` starts answering `otpRequired`, at which point this is the only
  route: a code emailed to one of the inboxes in `loginEmails`, then the
  passcode again. So the emailed code is not a second factor on every sign-in
  — it is what a lockout costs, and what clears it.

  The grant a verified code produces is good for exactly one passcode attempt.
  A wrong one revokes it, so guessing past the escalation costs a fresh email
  round trip each time rather than a keystroke — a rate limit the guesser does
  not control, in front of a secret that never changes.

  Nothing here throws to report a bad guess. A Convex mutation is a
  transaction and a throw rolls back its writes, so a mutation that threw
  would discard the very attempt it was trying to count — see the note at the
  top of auth.ts. Failures come back as `{ ok: false }`.
*/

const CODE_TTL_MS = 10 * 60 * 1000;
/** Stated in the email, so the two must agree. */
export const CODE_TTL_MINUTES = 10;
/*
  The window to type a passcode once the code is accepted. Long enough to
  find it, short enough that a machine left unlocked does not stay half
  signed-in all afternoon.
*/
const GRANT_TTL_MS = 5 * 60 * 1000;
/** Wrong codes against one challenge before it is burned. */
const MAX_CODE_ATTEMPTS = 5;
/** How long before another code can be asked for, so the inbox is not flooded. */
const RESEND_COOLDOWN_MS = 60 * 1000;

function normalise(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Six digits from the system's cryptographic source.
 *
 * `Math.random` is seeded and predictable; a code generated from it is
 * guessable by anyone who has seen a few, which defeats the point of emailing
 * one. The modulo is taken over a range that divides evenly into 2^32 minus
 * the remainder, so every code is equally likely.
 */
function sixDigitCode() {
  const buf = new Uint32Array(1);
  const limit = 1_000_000;
  const ceiling = Math.floor(0xffffffff / limit) * limit;
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= ceiling);
  return String(n % limit).padStart(6, "0");
}

/* ------------------------------------------------------------- allowlist */

/** Whether an address may sign in at all. Used by the action before emailing. */
export const isAllowed = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("loginEmails")
      .withIndex("by_email", (q) => q.eq("email", normalise(args.email)))
      .unique();
    return row && row.active ? { email: row.email, label: row.label } : null;
  },
});

/**
 * The addresses that may sign in. Signed-in callers only — it is a list of
 * who has the keys, and there is no reason for the login screen to show it.
 */
export const listEmails = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    return await ctx.db.query("loginEmails").collect();
  },
});

/**
 * Adds or re-activates an address.
 *
 * Internal, so the allowlist cannot be extended from the browser — an
 * account takeover that could add its own address would be permanent. Run it
 * with the deployment's admin credentials:
 *
 *   npx convex run otp:allowEmail '{"email":"someone@gmail.com","label":"Partner"}'
 *   npx convex run --prod otp:allowEmail '{"email":"someone@gmail.com"}'
 */
export const allowEmail = internalMutation({
  args: { email: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const email = normalise(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("That is not a valid email address.");
    }
    const existing = await ctx.db
      .query("loginEmails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { active: true, label: args.label ?? existing.label });
      return `${email} can sign in.`;
    }
    await ctx.db.insert("loginEmails", {
      email,
      label: args.label,
      active: true,
      createdAt: Date.now(),
    });
    return `${email} added.`;
  },
});

/**
 * Withdraws access without losing the record of it.
 *
 *   npx convex run otp:blockEmail '{"email":"someone@gmail.com"}'
 */
export const blockEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalise(args.email);
    const row = await ctx.db
      .query("loginEmails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!row) throw new ConvexError("That address is not on the list.");
    await ctx.db.patch(row._id, { active: false });
    // Anything already in flight for them stops working now, not in ten minutes.
    for (const c of await ctx.db
      .query("otpChallenges")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect()) {
      await ctx.db.delete(c._id);
    }
    return `${email} blocked.`;
  },
});

/* ----------------------------------------------------------------- codes */

/**
 * Creates the challenge and hands the action the code to email.
 *
 * Internal: the code is a secret in transit between two server functions and
 * must never be returnable to a browser.
 */
export const issueCode = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalise(args.email);
    const now = Date.now();

    const existing = await ctx.db
      .query("otpChallenges")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    // One in flight at a time, and not more often than the cooldown, so the
    // endpoint cannot be used to bury someone's inbox.
    const newest = existing.reduce<(typeof existing)[number] | null>(
      (latest, row) => (latest === null || row.createdAt > latest.createdAt ? row : latest),
      null,
    );
    if (newest && now - newest.createdAt < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - newest.createdAt)) / 1000);
      return { ok: false as const, error: `Wait ${wait} seconds before asking for another code.` };
    }
    for (const row of existing) await ctx.db.delete(row._id);

    const code = sixDigitCode();
    await ctx.db.insert("otpChallenges", {
      email,
      codeHash: await sha256Hex(code),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      createdAt: now,
    });
    return { ok: true as const, code };
  },
});

/**
 * Asks for a code.
 *
 * An action rather than a mutation because it has to reach the mailer over
 * HTTP, which a mutation cannot do — mutations are transactions and may be
 * retried, and a retried transaction that sent an email would send it twice.
 *
 * An address that is not on the list is told so plainly. Hiding it would be
 * the right call for a public sign-up, but this list has two rows in it and
 * both belong to the people reading the screen; a silent failure would just
 * look like the email never arrived.
 */
export const requestCode = action({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Enter a valid email address." };
    }

    const allowed = await ctx.runQuery(internal.otp.isAllowed, { email });
    if (!allowed) {
      return { ok: false, error: "That address cannot sign in to this shop." };
    }

    const issued = await ctx.runMutation(internal.otp.issueCode, { email });
    if (!issued.ok) return { ok: false, error: issued.error };

    const base = process.env.MAILER_URL;
    const key = process.env.MAILER_API_KEY;
    if (!base || !key) {
      return {
        ok: false,
        error: "Email is not configured on the server. Set MAILER_URL and MAILER_API_KEY.",
      };
    }

    try {
      const response = await fetch(`${base.replace(/\/+$/, "")}/send/otp`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key },
        body: JSON.stringify({
          to: email,
          name: allowed.label,
          code: issued.code,
          minutes: CODE_TTL_MINUTES,
        }),
      });
      if (!response.ok) {
        // The mailer's own message may name the sending account; log it there.
        console.error("[otp] mailer replied", response.status, await response.text());
        return { ok: false, error: "The code could not be emailed. Try again shortly." };
      }
    } catch (err) {
      console.error("[otp] mailer unreachable", err);
      return { ok: false, error: "The email service is unreachable. Try again shortly." };
    }

    return { ok: true };
  },
});

/**
 * Checks the code and, if it is right, opens the passcode step.
 *
 * The grant token is returned once and stored only as a hash, exactly as a
 * session token is. The browser holding it proves the code was answered; it
 * proves nothing else, and on its own it will not sign anyone in.
 */
export const verifyCode = mutation({
  args: { email: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const email = normalise(args.email);
    const now = Date.now();

    const challenge = await ctx.db
      .query("otpChallenges")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!challenge || challenge.expiresAt <= now) {
      if (challenge) await ctx.db.delete(challenge._id);
      return { ok: false as const, error: "That code has expired. Ask for a new one." };
    }
    if (challenge.attempts >= MAX_CODE_ATTEMPTS) {
      await ctx.db.delete(challenge._id);
      return { ok: false as const, error: "Too many wrong codes. Ask for a new one." };
    }

    const given = await sha256Hex(args.code.trim());
    if (!timingSafeEqual(given, challenge.codeHash)) {
      await ctx.db.patch(challenge._id, { attempts: challenge.attempts + 1 });
      const left = MAX_CODE_ATTEMPTS - (challenge.attempts + 1);
      return {
        ok: false as const,
        error:
          left > 0
            ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
            : "That code is not right. Ask for a new one.",
      };
    }

    const grantToken = randomHex(32);
    await ctx.db.patch(challenge._id, {
      grantHash: await sha256Hex(grantToken),
      grantExpiresAt: now + GRANT_TTL_MS,
      // Spent, so the same code cannot open a second grant.
      codeHash: await sha256Hex(randomHex(32)),
    });
    return { ok: true as const, grantToken, grantExpiresAt: now + GRANT_TTL_MS };
  },
});

/**
 * The passcode again, this time against a verified code.
 *
 * `viaOtp` is passed so the escalation does not refuse the very attempt it
 * asked for — the code has just been answered, and demanding another would
 * be a loop with no exit.
 *
 * A wrong passcode deletes the challenge outright, so the passcode step
 * closes and a fresh code has to be fetched. That is what caps guesses at one
 * per email rather than one per keystroke. A right one clears the failure
 * count, and the next sign-in is back to the passcode alone.
 */
export const completeLogin = mutation({
  args: { grantToken: v.string(), passcode: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: false; restart: true; error: string }
    | { ok: true; token: string; expiresAt: number }
  > => {
    const now = Date.now();
    const grantHash = await sha256Hex(args.grantToken);
    const challenge = await ctx.db
      .query("otpChallenges")
      .withIndex("by_grantHash", (q) => q.eq("grantHash", grantHash))
      .unique();

    if (!challenge || (challenge.grantExpiresAt ?? 0) <= now) {
      if (challenge) await ctx.db.delete(challenge._id);
      return {
        ok: false,
        restart: true,
        error: "That sign-in step expired. Ask for a new code.",
      };
    }

    const result = await attemptPasscode(ctx, args.passcode, true);
    if (!result.ok) {
      // Burned either way: one grant, one attempt.
      await ctx.db.delete(challenge._id);
      return { ok: false, restart: true, error: result.error };
    }

    await ctx.db.delete(challenge._id);
    const row = await ctx.db
      .query("loginEmails")
      .withIndex("by_email", (q) => q.eq("email", challenge.email))
      .unique();
    if (row) await ctx.db.patch(row._id, { lastLoginAt: now });

    const session = await issueSession(ctx);
    return { ok: true, token: session.token, expiresAt: session.expiresAt };
  },
});

/**
 * A way back in when the mailer is down.
 *
 * The whole sign-in now depends on an outside service, so there has to be a
 * door that does not. This one needs the deployment's admin credentials,
 * which is a higher bar than either factor it bypasses:
 *
 *   npx convex run otp:recoverSession
 *   npx convex run --prod otp:recoverSession
 *
 * Paste the token it prints into the browser console as:
 *   localStorage.setItem("ac.session", "<token>"); location.reload()
 */
export const recoverSession = internalMutation({
  args: {},
  handler: async (ctx) => {
    const session = await issueSession(ctx);
    return {
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
      how: 'localStorage.setItem("ac.session", "<token>"); location.reload()',
    };
  },
});

/** Drops challenges nobody finished, so the table does not grow forever. */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("otpChallenges")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(500);
    for (const row of stale) await ctx.db.delete(row._id);
    return `Purged ${stale.length} expired challenge(s).`;
  },
});
