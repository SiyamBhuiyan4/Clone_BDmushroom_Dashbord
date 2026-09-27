import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import nodemailer from "nodemailer";
import { LOGO_CID } from "./template.js";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/*
  The logo travels with the message rather than being linked.

  Gmail blocks `data:` URIs in email outright, and a hotlinked image is hidden
  until the reader clicks "display images" — which on a sign-in code is most
  of them. Attached under a Content-ID it renders inline on first open, with
  no request back to us and nothing to track.

  Read once at module load: it is 75 KB and never changes between sends.
*/
let logo = null;
function logoAttachment() {
  if (logo === null) {
    logo = readFileSync(join(here, "..", "assets", "bdmushroom.png"));
  }
  return {
    filename: "bdmushroom.png",
    content: logo,
    contentType: "image/png",
    cid: LOGO_CID,
    // Inline, so it renders in place instead of listing as a download.
    contentDisposition: "inline",
  };
}

let transport = null;

/**
 * The SMTP connection, made once and reused.
 *
 * Gmail's own host and port 465, which is implicit TLS — the connection is
 * encrypted before a single byte of the password crosses it. Port 587 with
 * STARTTLS would upgrade an already-open plaintext socket, which is the
 * weaker of the two when both are on offer.
 *
 * The credentials are read here rather than at import, so a missing .env
 * fails with a clear message on the first send instead of at startup in a
 * serverless cold start where nobody sees it.
 */
export function getTransport() {
  if (transport) return transport;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER and GMAIL_APP_PASSWORD must be set. Copy .env.example to .env and fill it in.",
    );
  }

  transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    // Gmail app passwords are shown in groups of four; the spaces are for
    // reading, not part of the secret, and SMTP rejects them.
    auth: { user, pass: pass.replace(/\s+/g, "") },
  });
  return transport;
}

/** The address messages appear to come from. */
export function fromAddress() {
  const name = process.env.MAIL_FROM_NAME || "BD Mushroom";
  return `"${name}" <${process.env.GMAIL_USER}>`;
}

/**
 * Decodes the attachments an API caller sent.
 *
 * Content arrives base64-encoded because JSON cannot carry bytes. Anything
 * that is not a string is rejected rather than coerced — a silently empty
 * attachment is worse than a refused request.
 */
export function decodeAttachments(attachments) {
  if (!attachments) return [];
  if (!Array.isArray(attachments)) throw new Error("`attachments` must be an array.");
  return attachments.map((file, index) => {
    if (!file || typeof file !== "object") {
      throw new Error(`Attachment ${index + 1} is not an object.`);
    }
    if (typeof file.filename !== "string" || !file.filename.trim()) {
      throw new Error(`Attachment ${index + 1} needs a filename.`);
    }
    if (typeof file.content !== "string") {
      throw new Error(`Attachment ${index + 1} needs base64 \`content\`.`);
    }
    return {
      filename: file.filename.trim(),
      content: Buffer.from(file.content, "base64"),
      ...(file.contentType ? { contentType: file.contentType } : {}),
    };
  });
}

/** Sends one message, with the logo attached so the template can show it. */
export async function send({ to, subject, html, text, attachments = [], replyTo }) {
  const info = await getTransport().sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
    attachments: [logoAttachment(), ...attachments],
  });
  return info.messageId;
}

export { require };
