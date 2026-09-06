# Ledger — account management

A dashboard for tracking what you buy, what you sell it for, and what you actually
made. Built on [Convex](https://convex.dev) (reactive database + backend
functions), React 19, Vite and Tailwind CSS v4.

## Running it

```bash
npm install
npm run dev        # runs Vite and `convex dev` together
```

Open http://localhost:5173.

`npm run dev` needs a Convex deployment. This repo is already linked to one via
`.env.local` (gitignored). On a fresh machine, run `npx convex dev` once — it
provisions a deployment and writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` for
you. If `VITE_CONVEX_URL` is missing the app renders a short setup notice instead
of failing blank.

| Command | What it does |
|---|---|
| `npm run dev` | Frontend + Convex backend, both watching |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run lint` | Typecheck only |
| `npx convex run seed:demo` | Load the bdmushroom.com catalogue + sample sales (clears first) |
| `npx convex run seed:clear` | Delete every product and sale |
| `npx convex run seed:count` | Row counts, passcode state, active sessions |
| `npx convex dashboard` | Open the Convex data browser |

## Dev and production are separate databases

This repo is linked to the Convex project **`acmanagement`**, which has two
independent deployments with their own data and their own passcode:

| | Deployment | Used by |
|---|---|---|
| Development | `tidy-zebra-69` | `npm run dev` on your machine |
| Production | `fastidious-civet-245` | the Vercel deployment |

Adding a product locally does **not** put it in production. Add `--prod` to any
command to target production instead:

```bash
npx convex run seed:count           # development
npx convex run --prod seed:count    # production
npx convex run --prod seed:demo     # reseed production's catalogue
```

Each deployment also needs its own passcode — setting one locally does not set
it in production.

## Passcode lock

The app is behind a passcode. On first visit it asks you to set one; after that
it asks for it, and a session lasts **one day** before you sign in again.

How it is stored and checked:

- The passcode is **never stored**. `authConfig` holds a PBKDF2-SHA256
  derivation of it (210,000 iterations, random 16-byte per-install salt).
- Verification happens on the server, with a constant-time comparison so a
  wrong guess cannot be timed.
- On success the server issues a random 256-bit token. Only the token's
  SHA-256 hash is stored, so dumping the `sessions` table does not let anyone
  log in.
- **Every data function requires a valid token.** `products`, `sales` and
  `dashboard` all call `requireSession`. This matters: Convex functions are
  public HTTP endpoints, so a login screen that only hid the UI would protect
  nothing.
- Eight failed attempts in ten minutes locks logins for the rest of the window.
- Changing the passcode revokes every existing session.

| Command | What it does |
|---|---|
| `npx convex run auth:reset` | Forgot the passcode — clears it and revokes all sessions, so the app shows the setup screen again. Product and sale data is untouched. |

`auth:reset` is an internal function: it cannot be called from a browser, only
from a machine holding your Convex admin credentials.

### Known limits

- The first-run setup screen is open to whoever reaches the deployment first.
  Set your passcode immediately after deploying.
- The brute-force throttle is global, not per-IP (Convex does not expose a
  client address), so a determined attacker can lock *you* out for ten minutes.
  Reasonable for a single-tenant dashboard; not for a multi-user product.
- There is one passcode, not per-user accounts.

## Deploying to Vercel

`vercel.json` already sets the build command, output directory and framework.
The **only** thing to configure is one environment variable:

| Name | Value | Environment |
|---|---|---|
| `CONVEX_DEPLOY_KEY` | your Convex **production** deploy key | Production |

Add it in Vercel under *Project → Settings → Environment Variables*. Generate the
key in the Convex dashboard under *Settings → Deploy Keys → Generate production
key*. Treat it like a password — it is not stored in this repo.

**Do not set `VITE_CONVEX_URL` yourself.** The build runs
`npx convex deploy --cmd 'npm run build'`, which pushes the functions in
`convex/` to your production deployment and injects the correct
`VITE_CONVEX_URL` into the frontend build for you. Setting it by hand will point
the deployed app at the wrong backend.

For preview deployments, use a Convex *preview* deploy key scoped to the Preview
environment instead — each branch then gets its own throwaway backend.

Routing is hash-based (`/#/products`), so no SPA rewrite rules are needed.

## How it works

**Products** have a name, a cost price (any amount), a free-text details box, an
optional category, and a stock quantity.

**Sales** record a sale price (any amount), a quantity, and optionally a buyer,
note and date. Recording a sale takes the units out of stock; deleting one puts
them back.

The important design decision: a sale **snapshots the product's name and cost
price** at the moment it is recorded. Reprice or rename a product later, or
delete it entirely, and your historical revenue and profit do not move. Profit is
always `(sale price − cost at time of sale) × quantity`.

### Pages

- **Dashboard** — profit, revenue, sale count and available stock, a
  revenue-vs-profit line chart, top products by profit, recent sales, and a
  low-stock list. One date-range control (7d / 30d / 90d / 12m) scopes the whole
  page.
- **Products** — search, category filter, archive toggle. Each card sells,
  edits, restocks (± buttons), archives or deletes.
- **Sales** — full ledger with search, date range, running totals, inline
  edit/delete, and CSV export.

All amounts are in Bangladeshi taka (৳). Theme (light / dark / system) and the
sidebar's collapsed state live in the sidebar footer and persist in
`localStorage`. On desktop the sidebar collapses to an icon-only rail; below
`lg` it is a drawer opened from the top bar.

## Layout

```
convex/
  schema.ts      products + sales tables and indexes
  products.ts    list, create, update, restock, archive, delete
  sales.ts       list, create (decrements stock), update, delete (restores stock)
  dashboard.ts   one query backing the whole dashboard
  seed.ts        dev-only sample data (internal functions, CLI only)
src/
  App.tsx        shell, sidebar, hash routing
  lib/           formatting, settings context, toasts
  components/    UI primitives, dialogs, hand-rolled SVG charts
  pages/         Dashboard, Products, Sales
```

## Notes

- Day bucketing and "last N days" filtering happen in the browser, deliberately —
  the server would bucket in UTC and put sales in the wrong day.
- The charts are hand-written SVG rather than a charting library, so the marks,
  crosshair, direct labels and both color themes are all under direct control.
  Both series palettes are validated for colorblind separation and contrast
  against their surfaces.
- `seed.ts` uses `internalMutation`, so the seed and clear functions are not
  reachable from the browser — only from the CLI.
