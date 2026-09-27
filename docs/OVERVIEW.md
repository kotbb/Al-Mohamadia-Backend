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

For coding agents and implementation rules, see [AGENTS.md](./AGENTS.md).

> **Note:** Build is phased (vertical slices). See
> [PHASES.md](./PHASES.md) for what exists vs planned. **Phases 0–9 are
> complete** on both apps (through the audit log UI). Phase 10 (Polish & Hardening) is next.

---

## Implemented API (by phase)

| Phase | Status | Modules / routes |
|-------|--------|------------------|
| 0 | Done | Health (`GET /health`), global envelope, audit writer |
| 1 | Done | `auth` (login, refresh, logout), `users` (admin CRUD, `GET /users/me`) |
| 2 | Done | `categories`, `items`, `settings` — see [PHASES.md](./PHASES.md#phase-2--categories-items--pricing) |
| 3 | Done | `customers`, `suppliers` — CRUD, search, merge, debt summaries — see [PHASES.md](./PHASES.md#phase-3--customers--suppliers) |
| 4 | Done | `sales-invoices` — create/list/get/cancel/pdf/share + public token PDF — see [PHASES.md](./PHASES.md#phase-4--sales-invoicing-core-feature) |
| 5 | Done | `payments` — record standalone debt payment, cancel, filterable list, method & notes — see [PHASES.md](./PHASES.md#phase-5--payments-standalone-debt-payments) |
| 6 | Done | `purchases` (create/list/get/cancel), `supplier-payments` (record/list/get/cancel) — see [PHASES.md](./PHASES.md#phase-6--purchasing--restocking-including-supplier-payments) |
| 7 | Done | `inventory` — stock levels with status flags, valuation at cost & selling, stock adjustments (`GET /inventory/stock`, `GET /inventory/valuation`, `POST/GET /inventory/adjustments`) — see [PHASES.md](./PHASES.md#phase-7--inventory-management) |
| 8 | Done | `dashboard` — today KPIs, debt strip, period-scoped sales series + top sellers (`GET /dashboard`) — see [PHASES.md](./PHASES.md#phase-8--dashboard) |

Phases 9–10 are not implemented on the backend yet.

## What this system does

| Domain              | Business purpose                                                             |
| ------------------- | ---------------------------------------------------------------------------- |
| **Auth & users**    | Login, refresh, logout; `super_admin` manages admins; `admin` runs the shop  |
| **Items & pricing** | Categories, items, per-piece / per-m³ pricing, cost, price history, base reference price *(Phase 2 — live)* |
| **Sales invoicing** | Cash or customer sales, line items, discount, paid/remaining, cancel, Arabic PDF + WhatsApp share link *(Phase 4 — live)* |
| **Customer payments** | Payments on new sales + standalone debt payments against customer balance *(Phase 5 — live)* |
| **Customers**       | CRUD, running مديونية, search, merge duplicates *(Phase 3 — live)*           |
| **Suppliers**       | CRUD, amount owed, search, merge duplicates *(Phase 3 — live)*               |
| **Purchases**       | Restock invoices; increase stock and supplier amount owed *(Phase 6 — live)* |
| **Supplier payments** | Payments on purchases + standalone debt payments to suppliers *(Phase 6 — live)* |
| **Inventory**       | Live stock, low-stock flags, manual جرد adjustments, inventory valuation at cost & selling *(Phase 7 — live)* |
| **Dashboard**       | Today's sales / profit / collected / invoice count, debt totals, period chart + top items *(Phase 8 — live)* |
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
  `Supplier`, `User`, `Item`. `ItemPriceHistory`, `StockAdjustment`, and
  `AuditLog` are
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
- Manual stock corrections go through `StockAdjustment` with a reason.
- Dimensions (`thickness` × `width` × `length`, cm) are required on sales
  lines only when the item `pricingMode` is `per_cubic_meter`.

### Audit log

`AuditLog` is a unified activity feed (who / what / when), not a second copy
of every diff:

| Action           | Storage                                                    |
| ---------------- | ---------------------------------------------------------- |
| `price_changed`  | Pointer via `refCollection` / `refId` → `ItemPriceHistory` |
| `stock_adjusted` | Pointer via `refCollection` / `refId` → `StockAdjustment`  |
| Other edits      | `changes` per-field `{ old, new }` on the audit entry      |

Write the audit entry in the **same transaction** as the mutation. See
[DATABASE.md](./DATABASE.md) (`AuditLog` section).

### Domain model (summary)

```text
User (super_admin | admin) → RefreshToken

Category → Item
  ├── ItemPriceHistory
  └── StockAdjustment

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
| `NODE_ENV`               | `development`                          | `production` |
| `PORT`                   | HTTP port (default `3000`)             |
| `JWT_ACCESS_SECRET`      | Access token signing secret (Phase 1)  |
| `JWT_REFRESH_SECRET`     | Refresh token signing secret (Phase 1) |
| `JWT_ACCESS_EXPIRES_IN`  | e.g. `10m` (Phase 1)                   |
| `JWT_REFRESH_EXPIRES_IN` | e.g. `21d` (Phase 1)                   |
| `PUBLIC_API_BASE_URL`    | Absolute API origin for WhatsApp/public PDF links (default `http://localhost:3000`) |
| `SUPER_ADMIN_USERNAME`   | Seed script only (`seed:super-admin`)  |
| `SUPER_ADMIN_PASSWORD`   | Seed script only (`seed:super-admin`)  |
| `SEED_BALADI_WOOD_METER_PRICE` | Optional override for `seed:catalog` (default `850`) |

### Seed scripts (development)

```bash
npm run seed:super-admin   # first super_admin (requires SUPER_ADMIN_* in .env)
npm run seed:catalog       # categories, sample items, baladi_wood_meter_price setting
npm run seed:parties       # sample customers and suppliers (some with opening balances)
npm run seed:invoices      # sample cash + customer sales invoices (requires catalog + parties + user)
```

All seed scripts are idempotent — safe to re-run; existing records are skipped.

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

---

## Tests

```bash
npm run test          # unit (src/**/*.spec.ts)
npm run test:e2e      # e2e
npm run test:cov      # coverage
```

Prioritize the money-critical paths (invoice create/cancel, payments, stock)
once those phases land.

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
| [AGENTS.md](./AGENTS.md)                                                           | Backend agent rules (transactions, soft delete, audit, business rules) |
| [DATABASE.md](./DATABASE.md)                                                       | Full Mongo schema and relationships                                    |
| [PHASES.md](./PHASES.md)                                                           | Phased vertical-slice build plan and status                            |
| [../../Al-Mohamadia-Frontend/docs/Design-System.md](../../Al-Mohamadia-Frontend/docs/Design-System.md) | Frontend design tokens (UI only)                                       |
