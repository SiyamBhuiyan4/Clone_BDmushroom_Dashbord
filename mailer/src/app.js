import express from "express";
import { decodeAttachments, send } from "./mailer.js";
import {
  renderMessage,
  renderMessageText,
  renderOtp,
  renderOtpText,
} from "./template.js";

/*
  A send API, not an open relay.

  Every route that sends anything is behind an API key. Without one this is a
  service that will email arbitrary text to arbitrary addresses from a real
  Gmail account, which is a spam relay the moment its URL is discovered — and
  a discovered URL is the normal case for anything deployed publicly.

  The key is compared in constant time. A plain `!==` leaks the position of
  the first wrong character through timing, which is enough to recover a key
  given patience.
*/

const OTP_MINUTES = Number(process.env.OTP_MINUTES || 10);

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  // Compare same-length buffers so the check itself cannot reveal the length.
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function requireApiKey(req, res, next) {
  const expected = process.env.MAILER_API_KEY;
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "MAILER_API_KEY is not set on the server, so nothing can be sent.",
    });
  }
  const given = req.get("x-api-key") || "";
  if (!timingSafeEqual(given, expected)) {
    return res.status(401).json({ ok: false, error: "Bad or missing x-api-key." });
  }
  return next();
}

/** Rejects anything that is not plausibly one address. */
function cleanAddress(value) {
  const email = String(value ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** `to` may be one address or several; the result is always a list. */
function cleanRecipients(value) {
  const list = Array.isArray(value) ? value : [value];
  const cleaned = list.map(cleanAddress);
  if (cleaned.some((address) => address === null)) return null;
  if (cleaned.length === 0) return null;
  return cleaned;
}

export function createApp() {
  const app = express();
  // Generous enough for a PDF receipt base64-encoded, which inflates by ~33%.
  app.use(express.json({ limit: "12mb" }));

  /** Liveness, deliberately unauthenticated and deliberately saying nothing. */
  app.get("/health", (_req, res) => res.json({ ok: true, service: "aziel-mailer" }));

  /**
   * The general send.
   *
   *   POST /send
   *   x-api-key: …
   *   { to, name?, subject, body, html?, attachments?: [{filename, content, contentType?}] }
   *
   * `body` is plain text and gets the branded wrapper. `html` replaces the
   * whole message for a caller that wants to build its own.
   */
  app.post("/send", requireApiKey, async (req, res) => {
    try {
      const { to, name, subject, body, html, replyTo, attachments } = req.body ?? {};

      const recipients = cleanRecipients(to);
      if (!recipients) {
        return res.status(400).json({ ok: false, error: "`to` must be a valid email address." });
      }
      if (typeof subject !== "string" || !subject.trim()) {
        return res.status(400).json({ ok: false, error: "`subject` is required." });
      }
      if (!html && (typeof body !== "string" || !body.trim())) {
        return res.status(400).json({ ok: false, error: "Send either `body` or `html`." });
      }
      if (replyTo !== undefined && cleanAddress(replyTo) === null) {
        return res.status(400).json({ ok: false, error: "`replyTo` is not a valid address." });
      }

      let files;
      try {
        files = decodeAttachments(attachments);
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }

      const messageId = await send({
        to: recipients.join(", "),
        subject: subject.trim(),
        html: html || renderMessage({ name, subject: subject.trim(), body }),
        text: html ? undefined : renderMessageText({ name, subject: subject.trim(), body }),
        replyTo,
        attachments: files,
      });

      return res.json({ ok: true, messageId });
    } catch (err) {
      // The SMTP error can name the account, so it is logged and not returned.
      console.error("[mailer] send failed:", err);
      return res.status(502).json({ ok: false, error: "The message could not be sent." });
    }
  });

  /**
   * The sign-in code, rendered the one agreed way.
   *
   *   POST /send/otp
   *   { to, name?, code, minutes? }
   *
   * Its own route so the code's presentation lives here rather than being
   * rebuilt by every caller — and so a caller cannot accidentally send one
   * without the expiry line.
   */
  app.post("/send/otp", requireApiKey, async (req, res) => {
    try {
      const { to, name, code, minutes } = req.body ?? {};

      const recipient = cleanAddress(to);
      if (!recipient) {
        return res.status(400).json({ ok: false, error: "`to` must be a valid email address." });
      }
      if (typeof code !== "string" || !/^[0-9]{4,8}$/.test(code)) {
        return res.status(400).json({ ok: false, error: "`code` must be 4–8 digits." });
      }

      const life = String(minutes ?? OTP_MINUTES);
      const messageId = await send({
        to: recipient,
        subject: `${code} is your sign-in code`,
        html: renderOtp({ name, code, minutes: life }),
        text: renderOtpText({ name, code, minutes: life }),
      });

      return res.json({ ok: true, messageId });
    } catch (err) {
      console.error("[mailer] otp send failed:", err);
      return res.status(502).json({ ok: false, error: "The code could not be sent." });
    }
  });

  app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found." }));

  return app;
}
