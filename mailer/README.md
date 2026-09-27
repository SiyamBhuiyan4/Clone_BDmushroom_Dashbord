# Aziel Mailer

A small Gmail SMTP send API. Takes a name, a subject, a body and any
attachments, and sends a branded message. Used by the ledger's sign-in to
email one-time codes, and usable on its own for anything else.

Nothing here reads the shop's database. It sends mail and that is all.

---

## Setup

```bash
cd mailer
npm install
cp .env.example .env     # then fill it in
npm start                # http://localhost:4000
```

`.env` holds the Gmail app password and is git-ignored. Never commit it, and
never put it in the frontend — anything the browser can read is public.

Generate the API key with:

```bash
openssl rand -hex 32
```

---

## Endpoints

Every send needs the `x-api-key` header. Without it this is an open relay for
a real Gmail account, so the key is not optional.

### `GET /health`

```json
{ "ok": true, "service": "aziel-mailer" }
```

### `POST /send`

```jsonc
{
  "to": "someone@gmail.com",      // or ["a@x.com", "b@y.com"]
  "name": "Imran",                // optional, greets them by name
  "subject": "Your receipt",
  "body": "Plain text.\n\nBlank lines become paragraphs.",
  "html": "<p>…</p>",             // optional; replaces the whole template
  "replyTo": "shop@example.com",  // optional
  "attachments": [                // optional
    { "filename": "receipt.pdf", "content": "<base64>", "contentType": "application/pdf" }
  ]
}
```

Attachment `content` is base64 because JSON cannot carry bytes. The request
cap is 12 MB, which is roughly an 8 MB file once encoded.

### `POST /send/otp`

```jsonc
{ "to": "someone@gmail.com", "name": "Imran", "code": "482913", "minutes": 10 }
```

Its own route so the code's presentation lives in one place, and so no caller
can send one without the expiry line.

Both reply `{ "ok": true, "messageId": "…" }`, or `{ "ok": false, "error": "…" }`
with a 4xx/5xx. SMTP errors are logged rather than returned — they can name the
sending account.

---

## Deploying

The sign-in flow calls this from Convex's servers, so `localhost` will not do —
it has to be somewhere reachable from the internet.

```bash
cd mailer
npx vercel deploy --prod
```

Then set the same four variables in the Vercel project's settings:
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAILER_API_KEY`, `MAIL_FROM_NAME`.

Any Node host works — `npm start` is a plain Express server. `api/index.js`
and `vercel.json` are only there for Vercel's benefit.

### Point the ledger at it

```bash
npx convex env set MAILER_URL https://your-mailer.vercel.app
npx convex env set MAILER_API_KEY <the same key>

# and for production
npx convex env set --prod MAILER_URL https://your-mailer.vercel.app
npx convex env set --prod MAILER_API_KEY <the same key>
```

---

## The email

One design, in `src/template.js`: BD Mushroom's logo, the message, then a
footer reading *In collaboration with BD Mushroom* and *Courtesy of Aziel*
linking <https://aziel.vercel.app/>.

It is tables and inline styles rather than modern CSS, because email clients
are not browsers — Gmail strips `<style>` blocks in some views and ignores
flex and grid. The logo is attached under a Content-ID rather than linked or
inlined as a `data:` URI: Gmail blocks `data:` images outright, and a
hotlinked one stays hidden behind "display images", which on a sign-in code
is most readers.

To restyle, edit `src/template.js`. Send yourself one first — email clients
disagree about everything.

---

## Gmail's limits

A free Gmail account sends roughly 500 messages a day. Sign-in codes for two
people will not come close. Bulk sending from here will get the account
rate-limited, and that account is also the one the shop signs in with.

If the app password is ever exposed, revoke it at
<https://myaccount.google.com/apppasswords> and issue a new one. Revoking
breaks nothing else — app passwords are per-application by design.
