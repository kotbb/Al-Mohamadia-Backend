# Al-Mohamadia Backend (product overview)

> Internal / agent-facing product overview. The public GitHub README lives at
> [`../README.md`](../README.md).

NestJS API for a **small wood store**: sales invoicing, inventory, customers
and suppliers with running debt, purchases, dashboard aggregations, and an
append-only audit trail.

The Next.js admin UI talks **only** to this API. MongoDB is the source of
truth for stock, balances, invoices, and history.

Currency: **EGP (ج.م)** only. The API is **locale-agnostic** — return enum
codes (`saved`, `cancelled`, `cash_sale`, …); the frontend localizes.

For coding agents and implementation rules, see [AGENTS.md](../AGENTS.md).

Feature DTOs live in `src/modules/{feature}/dto/request/` for body/query inputs
and nested validation, or `dto/response/` for returned payloads. Internal
non-transport contracts remain in the feature's `types/` directory.

> **Note:** Build is phased (vertical slices). See
> [PHASES.md](./PHASES.md) for what exists vs planned. **Phases 0–10 are
> implemented** on both apps; manual language/mobile checks and deployment validation
> remain separate.

---

## Implemented API (by phase)

| Phase | Status | Modules / routes |
|-------|--------|------------------|
| 0 | Done | Health (`GET /health`), global envelope, audit writer |
| 1 | Done | `auth` (login, refresh, logout), `users` (admin CRUD, `GET /users/me`) |
| 2 | Done | `categories`, `items` — see [PHASES.md](./PHASES.md#phase-2--categories-items--pricing) |
| 3 | Done | `customers`, `suppliers` — CRUD, search, merge, debt summaries — see [PHASES.md](./PHASES.md#phase-3--customers--suppliers) |
| 4 | Done | `sales-invoices` — create/list/get/update/cancel/share + public token receipt — see [PHASES.md](./PHASES.md#phase-4--sales-invoicing-core-feature) |
| 5 | Done | `payments` — record standalone debt payment, cancel, filterable list, method & notes — see [PHASES.md](./PHASES.md#phase-5--payments-standalone-debt-payments) |
| 6 | Done | `purchases` (create/list/get/cancel), `supplier-payments` (record/list/get/cancel) — see [PHASES.md](./PHASES.md#phase-6--purchasing--restocking-including-supplier-payments) |
| 7 | Done | `inventory` — stock levels with status flags, valuation at cost & selling, manual stock adjustments recorded on the audit log (`GET /inventory/stock`, `GET /inventory/valuation`, `POST /inventory/adjustments`) — see [PHASES.md](./PHASES.md#phase-7--inventory-management) |
| 8 | Done | `dashboard` — today KPIs, debt KPI, period-scoped sales series + top sellers (`GET /dashboard`) — see [PHASES.md](./PHASES.md#phase-8--dashboard) |
| 9 | Done | `audit` — append-only log list and actor filter — see [PHASES.md](./PHASES.md#phase-9--audit-log-ui) |
| 10 | Done | Rate limits, money validation, error envelope; manual/deployment validation remains separate — see [PHASES.md](./PHASES.md#phase-10--polish--hardening) |

## What this system does

| Domain              | Business purpose                                                             |
| ------------------- | ---------------------------------------------------------------------------- |
| **Auth & users**    | Login, refresh, logout; `super_admin` manages admins; `admin` runs the shop  |
| **Items & pricing** | Categories, items, per-piece / per-m³ / `free_amount` pricing, cost and price history for stocked items, meter dimension defaults *(Phase 2 — live)* |
| **Sales invoicing** | Cash or customer sales, line items, discount, paid/remaining, update, cancel, client-side PNG A5 / PDF A4 export + WhatsApp sharing *(Phase 4 — live)* |
| **Customer payments** | Payments on new sales + standalone debt payments against customer balance *(Phase 5 — live)* |
| **Customers**       | CRUD, running مديونية, search, merge duplicates *(Phase 3 — live)*           |
| **Suppliers**       | CRUD, amount owed, search, merge duplicates *(Phase 3 — live)*               |
| **Purchases**       | Restock invoices; increase stock and supplier amount owed *(Phase 6 — live)* |
| **Supplier payments** | Payments on purchases + standalone debt payments to suppliers *(Phase 6 — live)* |
| **Inventory**       | Live stock, low-stock flags, manual جرد adjustments, inventory valuation at cost & selling *(Phase 7 — live)* |
| **Dashboard**       | Today's sales / gross profit / collected / invoice count, debt totals, selected-period sales and gross profit, period chart + top items *(Phase 8 — live)* |
| **Audit**           | Append-only activity feed for sensitive mutations                            |

---

## Consumers

| Consumer                                          | Auth                              | Notes                                         |
| ------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| [Al-Mohamadia Frontend](../../Al-Mohamadia-Frontend) | Bearer access JWT + refresh token | Single-tenant shop console; Arabic/English UI |

No public website webhooks, mobile apps, or multi-tenant headers in MVP.

---

## API conventions

- Base prefix: `/api/v1`
- Money: plain numbers in EGP; round to **2 decimals at write time**
- Validation: whitelist DTOs (`class-validator`); reject unknown body fields
- Never trust client-computed fields (`remaining`, `balance`, `amountOwed`,
  `lineTotal`, price snapshots) — **recompute server-side**
- Mutations that touch more than one collection run in a **Mongo transaction**
- Soft delete (`isDeleted` / `isActive`) on `Category`, `Customer`,
  `Supplier`, `User`, `Item`. `ItemPriceHistory` and `AuditLog` are
  append-only. `RefreshToken` is hard-deleted on logout / expiry / rotation
- Roles: `super_admin` only for user-management endpoints; `admin` (and
  `super_admin`) for everything else

Exact success/error envelope shape is set in Phase 0 — keep it consistent
once chosen.

Schema source of truth: [DATABASE.md](./DATABASE.md).

---

## Domain ownership & business rules

This backend **owns** stock, balances, invoice math, price history, stock
adjustments, and the audit trail. The frontend may preview totals; the API
is authoritative.

### Invariants

- `remaining = total - discount - paid` on every sales invoice.
- Saving a `customer_sale` with `remaining > 0` increases `Customer.balance`
  by **only** `remaining`. Cash sales do not touch balance.
- On-invoice `Payment` (`invoiceId` set): history + invoice `paid` /
  `remaining` only — **does not** change `Customer.balance` (would
  undercount debt if combined with `+= remaining`).
- Standalone `Payment` (`invoiceId` null, `customerId` set): **does**
  reduce `Customer.balance` by `amount`.
- Saving a sales invoice deducts `Item.stockQuantity` per line; **cancelling**
  reverses stock and reverses the `balance += remaining` applied at save.
- Saving a purchase invoice increases `Item.stockQuantity` and increases
  `Supplier.amountOwed` by `remaining`.
- On-purchase `SupplierPayment` (`purchaseId` set): history + purchase invoice `paid` /
  `remaining` only — **does not** change `Supplier.amountOwed` directly (debt was already set to
  that purchase's `remaining` on save).
- Standalone `SupplierPayment` (`purchaseId` null, `supplierId` set): **does**
  reduce `Supplier.amountOwed` by `amount`.
- Cancelling a purchase invoice reverses stock, reverses `Supplier.amountOwed += remaining`,
  and voids associated `SupplierPayment` records.
- Price/cost changes append `ItemPriceHistory` (never silent overwrite).
- Manual stock corrections update `Item.stockQuantity` and write
  `stock_adjusted` on `AuditLog` with the quantity and the reason.
- Dimensions (`thickness` × `width` × `length`, m) are required on sales and
  purchase lines when the item `pricingMode` is `per_cubic_meter`; piece dimensions
  are optional and descriptive.
- `free_amount` items are sales-only charges. Each invoice line takes a positive
  EGP amount and optional note; it has no stock movement, dimensions, or item cost.

### Audit log

`AuditLog` is a unified activity feed (who / what / when), not a second copy
of every diff:

| Action           | Storage                                                    |
| ---------------- | ---------------------------------------------------------- |
| `price_changed`  | Pointer via `refCollection` / `refId` → `ItemPriceHistory` |
| `stock_adjusted` | `changes.stockQuantity` and `changes.reason` on the audit entry |
| Other edits      | `changes` per-field `{ old, new }` on the audit entry      |

Write the audit entry in the **same transaction** as the mutation. See
[DATABASE.md](./DATABASE.md) (`AuditLog` section).

### Domain model (summary)

```text
User (super_admin | admin) → RefreshToken

Category → Item
  └── ItemPriceHistory

Customer
  ├── SalesInvoice → SalesInvoiceLine (+ Payment)
  └── Payment (standalone debt)

Supplier → PurchaseInvoice → PurchaseInvoiceLine

AuditLog (append-only)
```

---

## Project setup

```bash
npm install
cp .env.example .env   # then fill secrets — never commit .env
```

### Environment variables

See [`.env.example`](../.env.example) for the template.

| Variable                 | Purpose                                |
| ------------------------ | -------------------------------------- |
| `MONGO_URI`              | MongoDB connection string              |
| `NODE_ENV`               | `development` or `production` |
| `PORT`                   | HTTP port (default `3000`)             |
| `JWT_ACCESS_SECRET`      | Access token signing secret (Phase 1)  |
| `JWT_REFRESH_SECRET`     | Refresh token signing secret (Phase 1) |
| `JWT_ACCESS_EXPIRES_IN`  | e.g. `10m` (Phase 1)                   |
| `JWT_REFRESH_EXPIRES_IN` | e.g. `21d` (Phase 1)                   |
| `FRONTEND_URL`           | Base URL of frontend application for public WhatsApp receipts (default `http://localhost:3001`) |
| `CORS_ORIGIN`            | Comma-separated browser origins (default `http://localhost:3001`) |


### Seed scripts (development)

Available seed commands: `seed:catalog`, `seed:parties`, `seed:invoices`, `seed:purchases`, and `seed:inventory`. These contain mock data; check the target database before running them. Invoice, purchase and inventory seeds require an existing user.

There is no `seed:super-admin` script in this checkout. Initial account provisioning must be arranged separately; no public registration exists. Do not assume every seed is non-mutating when repeated.

### Run

```bash
# development (watch)
npm run start:dev

# production
npm run build
npm run start:prod
```

API default: `http://localhost:3000` under `/api/v1`.

If the frontend also wants port `3000`, run Next on another port (e.g.
`3001`) — see [Al-Mohamadia-Frontend OVERVIEW](../../Al-Mohamadia-Frontend/docs/OVERVIEW.md).

### Runtime and deployment

The checkout includes Dockerfiles and Compose, but no backend `vercel.json`.
The current API Dockerfile still installs Chromium and Compose sets legacy
Puppeteer variables, although no API receipt renderer uses them. Do not interpret
that container configuration as server-side PDF support or a minimal image.
Validate deployment settings separately for the intended host.

Set `MONGO_URI` to a transaction-capable replica set/Atlas database, JWT secrets, `CORS_ORIGIN` to the frontend origin and `FRONTEND_URL` for public receipt links. Frontend `NEXT_PUBLIC_API_URL` includes `/api/v1` and is embedded at build time. Mock seeds are for intended development data, not production initialization.

Compose lives in this repo and builds the sibling
`../Al-Mohamadia-Frontend` checkout. There is no Mongo container. The API
container reads `Al-Mohamadia-Backend/.env` (`MONGO_URI`, JWT secrets,
`CORS_ORIGIN`, `FRONTEND_URL`). The frontend image reads
`Al-Mohamadia-Frontend/.env` while it builds, including
`NEXT_PUBLIC_API_URL`. Change that value, then rebuild the frontend image.

```bash
docker compose up --build
```

The API is published on port `3000`. The frontend is published on host port
`3001`.

---

## Tests

```bash
npm run test          # unit (src/**/*.spec.ts)
npm run test:e2e      # e2e
npm run test:cov      # coverage
```

Prioritize existing money-critical regressions (invoice create/edit/cancel, payments,
stock, dimensions and legacy pricing) when changing those flows.

---

## Related repositories

| Repo                                              | Role                                     |
| ------------------------------------------------- | ---------------------------------------- |
| [Al-Mohamadia-Frontend](../../Al-Mohamadia-Frontend) | Next.js shop console (ar/en, light/dark) |

---

## Further reading

| Doc                                                                                | Contents                                                               |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`../README.md`](../README.md)                                                     | Public GitHub project README                                           |
| [AGENTS.md](../AGENTS.md)                                                           | Backend agent rules (transactions, soft delete, audit, business rules) |
| [DATABASE.md](./DATABASE.md)                                                       | Full Mongo schema and relationships                                    |
| [PHASES.md](./PHASES.md)                                                           | Phased vertical-slice build plan and status                            |
| [../../Al-Mohamadia-Frontend/docs/DESIGN-SYSTEM.md](../../Al-Mohamadia-Frontend/docs/DESIGN-SYSTEM.md) | Frontend design tokens (UI only)                                       |


## Architecture maintenance

Root `AGENTS.md` contains the complete agent instructions; this repository has one instruction file.
Named contracts live in feature `types/`, pure transformations and query builders
in `utils/`, and application/React orchestration remains in services/hooks.
Shared ownership is established by real cross-feature callers, not anticipated reuse.

Run `npm run check:architecture` and `npm run test:architecture` for placement
checks and their regression tests. The check also runs automatically before
`npm run build`. It uses the existing TypeScript AST parser and does not add a
dependency or change runtime behavior. Diagnostics identify file, line, rule,
and destination. These focused checks complement code review; they do not prove
all business logic or ownership decisions correct.

## Free-amount sales and export contracts

`free_amount` is a third item pricing mode (Arabic: مبلغ حر). It is selected at item creation and cannot be changed later. Sales invoice lines enter one amount, with canonical stored `quantity: 1` and `piecePrice: amount`; the server recomputes totals, snapshots zero cost, and makes no stock adjustment. Purchases and inventory reject these items. Mixed receipts show only the item, optional note, and amount for these lines; physical quantity and cubic totals exclude them.

Authenticated receipt and numeric/same-customer neighbor endpoints support frontend PNG A5/PDF A4 export; no image or PDF rendering runs in the API. Custom inclusive Cairo `from`/`to` ranges supplement preset periods.

The operating-expense feature and API have been retired. Expense and category data is removed only by explicitly running `npm run cleanup:expenses` to inspect counts, then `npm run cleanup:expenses -- --apply --confirm=DELETE-EXPENSE-DATA` against the intended database. Historical expense audit entries are retained.


### Mobile validation and invoice presentation

Customer/supplier phones accept optional Egyptian mobiles with canonical English local digits; unchanged legacy values remain intact. Text/null/money and invoice calculation guards are tightened. See [the optional-phone contract](DATABASE.md#optional-phones-and-dimension-contract)
and [current seed/maintenance limitations](../README.md#seed-data-development).
