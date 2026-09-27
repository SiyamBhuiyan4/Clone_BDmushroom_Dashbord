/*
  The one place the mail is designed.

  Email clients are not browsers: Gmail strips <style> blocks in some views,
  ignores flexbox and grid, and blocks `data:` image URIs outright. So this is
  tables, inline styles and a logo sent as a CID attachment — the only
  combination that renders the same in Gmail, Apple Mail and Outlook.

  The palette is the bdmushroom.com logo's own, matching the receipts the shop
  already sends: the deep green of the cap, and the coral of the swoosh.
*/

const GREEN_DEEP = "#2e6b38";
const GREEN = "#3e8548";
const CORAL = "#ee6c60";
const INK = "#1f2a24";
const MUTED = "#6b7b70";
const EDGE = "#dcebd6";
const PAPER = "#ffffff";
const CANVAS = "#f4f7f2";

export const AZIEL_URL = "https://aziel.vercel.app/";
/** Referenced as <img src="cid:…">; the send path attaches the file under it. */
export const LOGO_CID = "bdmushroom-logo";

/** Blocks the five characters that could otherwise close a tag or attribute. */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text becomes paragraphs; blank lines separate them. */
function paragraphs(body) {
  return String(body ?? "")
    .split(/\n{2,}/)
    .map((block) => escapeHtml(block.trim()).replace(/\n/g, "<br />"))
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:${INK};">${block}</p>`,
    )
    .join("");
}

/**
 * The shell every message shares: logo, content, then the courtesy footer.
 *
 * `content` is trusted HTML built by the callers below — never anything that
 * arrived over the wire unescaped.
 */
function shell({ preheader, content }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>BD Mushroom</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
<!-- The line shown in the inbox list, before anything is opened. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;background:${PAPER};border:1px solid ${EDGE};border-radius:14px;overflow:hidden;">
        <tr>
          <td style="height:4px;background:${GREEN_DEEP};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 32px 8px;">
            <img src="cid:${LOGO_CID}" width="132" alt="BD Mushroom"
                 style="display:block;width:132px;max-width:60%;height:auto;border:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 28px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <div style="height:1px;background:${EDGE};font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 32px 26px;">
            <p style="margin:0 0 6px;font-size:12px;line-height:18px;color:${MUTED};">
              In collaboration with <strong style="color:${GREEN_DEEP};">BD Mushroom</strong>
            </p>
            <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};">
              Courtesy of
              <a href="${AZIEL_URL}" style="color:${GREEN};font-weight:bold;text-decoration:none;">Aziel</a>
              &middot;
              <a href="${AZIEL_URL}" style="color:${MUTED};text-decoration:underline;">aziel.vercel.app</a>
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;line-height:17px;color:${MUTED};max-width:520px;">
        This message was sent automatically. Please do not reply to it.
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** A general message: a greeting, the body someone passed in, nothing else. */
export function renderMessage({ name, subject, body }) {
  const greeting = name
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:${INK};">Hi ${escapeHtml(name)},</p>`
    : "";
  return shell({
    preheader: subject,
    content: `
      <h1 style="margin:0 0 16px;font-size:19px;line-height:27px;color:${INK};font-weight:bold;">
        ${escapeHtml(subject)}
      </h1>
      ${greeting}
      ${paragraphs(body)}`,
  });
}

/**
 * The sign-in code.
 *
 * The digits are the whole message, so they are the largest thing on it and
 * spaced wide enough to be read off a phone without squinting. The expiry is
 * stated because a code with no stated life invites being tried ten minutes
 * later and read as broken.
 */
export function renderOtp({ name, code, minutes }) {
  const greeting = name
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:${INK};">Hi ${escapeHtml(name)},</p>`
    : "";
  return shell({
    preheader: `${code} is your sign-in code`,
    content: `
      <h1 style="margin:0 0 16px;font-size:19px;line-height:27px;color:${INK};font-weight:bold;">
        Your sign-in code
      </h1>
      ${greeting}
      <p style="margin:0 0 18px;font-size:15px;line-height:24px;color:${INK};">
        Enter this code to continue signing in.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center"
              style="background:${CANVAS};border:1px solid ${EDGE};border-radius:12px;padding:20px 12px;">
            <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
                        font-size:34px;line-height:42px;font-weight:bold;
                        letter-spacing:9px;color:${GREEN_DEEP};">${escapeHtml(code)}</div>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0;font-size:13px;line-height:21px;color:${MUTED};">
        It expires in ${escapeHtml(minutes)} minutes and can be used once.
      </p>
      <p style="margin:10px 0 0;font-size:13px;line-height:21px;color:${CORAL};">
        If you did not try to sign in, ignore this email and tell the shop owner.
      </p>`,
  });
}

/** The same message for clients that refuse HTML outright. */
export function renderOtpText({ name, code, minutes }) {
  return [
    name ? `Hi ${name},` : "Hi,",
    "",
    `Your sign-in code is ${code}`,
    `It expires in ${minutes} minutes and can be used once.`,
    "",
    "If you did not try to sign in, ignore this email and tell the shop owner.",
    "",
    "In collaboration with BD Mushroom.",
    `Courtesy of Aziel — ${AZIEL_URL}`,
  ].join("\n");
}

export function renderMessageText({ name, subject, body }) {
  return [
    name ? `Hi ${name},` : "Hi,",
    "",
    subject,
    "",
    body,
    "",
    "In collaboration with BD Mushroom.",
    `Courtesy of Aziel — ${AZIEL_URL}`,
  ].join("\n");
}
