# Organo Healers OS

POS, invoicing (proforma to invoice), customer CRM with follow-ups, inventory, reports and a business dashboard for **Organo Healers Plant Studio**.

```
apps/web        Next.js 16 (App Router, TypeScript, Tailwind v4, Origin UI / coss ui components)
apps/server     Express 5 API (TypeScript, Prisma, PostgreSQL on Neon, Brevo email, Puppeteer PDFs)
packages/shared Money maths, validation schemas, phone/template helpers, invoice layout model and
                the invoice renderer. Used by BOTH apps, so the live POS preview, the public link
                page and the server PDF are drawn by the same component with the same numbers.
```

The browser only talks to Next.js. `/api/*` is rewritten to the Express server, so the session cookie is first-party and `DATABASE_URL` / `BREVO_API_KEY` exist only in `apps/server/.env`.

## Run it

```bash
npm install
npm run dev               # API on :4000, web on :3000
```

Open http://localhost:3000 and sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `apps/server/.env`.

### First-time database setup

```bash
cp apps/server/.env.example apps/server/.env   # fill DATABASE_URL, DIRECT_URL, JWT_SECRET, SEED_ADMIN_PASSWORD
cp apps/web/.env.example apps/web/.env.local
npm run db:generate
npm run db:deploy         # apply migrations (use db:migrate when changing the schema)
npm run db:seed           # categories, catalog from the supplied PDFs, templates, 3 historical estimates
```

### Neon notes

- `DATABASE_URL` = **pooled** string (host contains `-pooler`), `DIRECT_URL` = **direct** string (migrations).
- Keep `sslmode=require`. **Remove `channel_binding=require`** (Prisma's engine hangs on it) and **don't add `pgbouncer=true`** (Neon's pooler handles prepared statements; the flag makes every query about 3x slower).
- Every query is a round trip to Neon's region. From India to `ap-southeast-1` that's ~150 ms, so saves take 1 to 2 s in local dev. Deploy the API in the same AWS region as the database and they become near-instant.

### Email (Brevo)

Add `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` (a sender verified in Brevo) to `apps/server/.env` and restart. Until then the app says email isn't configured instead of pretending to send.

## Tests

```bash
npm test
```

- `packages/shared` (29): invoice maths reproducing all three historical estimate totals, discounts/GST/round-off, Indian phone normalisation, WhatsApp link + message rendering, amount in words, UPI links.
- `apps/server` (38): API integration tests against a dedicated database from `apps/server/.env.test` (setup refuses to run unless the database name ends in `_test`): auth, validation, customer lookup and duplicates, concurrent document numbering, proforma to invoice conversion, stock sale/return on edit and cancel, historical prices after a price change, public links and view tracking, Brevo payload, WhatsApp logged as opened (not sent), multi-page A4 PDF, dashboard and every report.

## How the main workflows behave

| Workflow | Behaviour |
|---|---|
| Numbering | `PI-2026-0001`, `INV-2026-0001`, per type per year, reserved inside the save transaction with `INSERT ... ON CONFLICT ... RETURNING`, so concurrent saves never collide. |
| Snapshots | Each document stores customer, business and per-line product snapshots (name, SKU, MRP, rate, group names). Catalog or settings changes never rewrite history. |
| Proforma to invoice | Creates a new invoice linked to the proforma; the proforma is only marked Converted. |
| Stock | Only invoices move stock. Every change is an `InventoryMovement`; edits and cancellations write the difference (sale / return). |
| WhatsApp | Opens `wa.me/<number>?text=...` and logs "WhatsApp opened". It becomes "sent" only when someone confirms it on the document page. |
| Payments | Invoices become Partially paid / Paid from recorded payments only. Payments can be voided with a reason. |
| Public links | `/i/<random token>` with PDF download. Customer views mark proformas Viewed and appear on the timeline; staff previews don't count. |

## Seed data provenance

`apps/server/prisma/seed/catalog.ts` and `historical.ts` are transcribed from:

| Source | Used for |
|---|---|
| Ashoka University estimate (17 Sep 2026) | 15 trees with bag size and height, rates, the "trees" invoice layout |
| Sunil Saroha (OMAX) estimate (07 Sep 2026) | Plants, pots, materials, labour, transport, grouped-by-location layout |
| TDI Residential estimate (07 Sep 2026) | Same catalogue subset, payment details (UPI, bank, IFSC) |
| Greenri Lush Series catalogue (May 2026) | 87 planter sizes across 28 series with MRPs |

No prices were invented: unpriced items have `priceOnRequest`, stock starts at 0, and every rate seen in an estimate is kept in price history.
# Organo_healers
# Organo_healers
