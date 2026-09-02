# Implementation Phases

> This file is duplicated identically in `Al-Mohamadia-Backend/docs/` and
> `Al-Mohamadia-Frontend/docs/` so each project has full system context
> without needing to open the other repo. Keep both copies in sync.

This project is built as a series of **vertical slices**: each phase
delivers a complete, end-to-end feature (DB schema → NestJS module → Next.js
pages), validated by actually driving the real frontend against the real
backend, before the next phase starts. Do not build "the whole backend"
then "the whole frontend" — and do not silently expand a phase's scope.

Update this file's checkboxes/status as phases complete (in both copies),
and update `docs/DATABASE.md` (backend) / `docs/COLORS.md` (frontend) /
`docs/OVERVIEW.md` in the same PR whenever a phase changes the
schema or business rules.

---

## Phase 0 — Foundation

No business feature yet; this unblocks every later phase.

**Backend**
- MongoDB connection module, global `@nestjs/config` + validation
- Global exception filter, consistent API response/error shape
- `AuditLog` schema + a shared `AuditService` other modules will call later
- API versioning under `/api/v1`, health check endpoint

**Frontend**
- Tailwind theme tokens wired from `docs/COLORS.md` (light/dark CSS variables)
- i18n setup: `ar` (default, RTL) / `en` (LTR) routing + dictionaries
- Root layout with `dir` + theme toggle + language toggle
- Shared API client wrapper (base URL from `NEXT_PUBLIC_API_URL`)
- Shared app shell (sidebar/nav placeholder, empty/loading/error states)

**Done when:** both apps run; you can flip language and theme in the
browser; the frontend successfully calls the backend's health endpoint.

---

## Phase 1 — Auth & Users

**Backend**
- `User`, `RefreshToken` schemas
- Register (super_admin only), login, refresh, logout endpoints
- JWT access + refresh token issuance/rotation (hashed refresh token storage)
- Role guards: `super_admin`, `admin`
- Seed script for the first super admin account

**Frontend**
- Login page
- Auth context/store, token refresh handling in the API client
- Protected route wrapper
- Super-admin-only "manage admins" page (create / deactivate admin)

**Done when:** you can log in as super admin from the UI, create an admin,
log in as that admin, and confirm the admin cannot access user-management
UI or API routes.

---

## Phase 2 — Categories, Items & Pricing

**Backend** — *Done*

- [x] `Category`, `Item`, `ItemPriceHistory`, `Setting` schemas/modules
- [x] CRUD for categories and items (soft delete; category delete blocked when live items exist)
- [x] Price/cost update endpoint that appends to `ItemPriceHistory` + audit `price_changed`
- [x] Base reference price setting (سعر متر الخشب البلدي) via `settings`
- [x] Dev seed script: `npm run seed:catalog`

**Frontend** — *Done*

- [x] Items list grouped by category, search/filters, base reference price card
- [x] Add/edit item **modal** (pricing mode toggle; auto-generated editable code)
- [x] Price history **modal** per item
- [x] Soft-delete item with confirmation (row actions kebab menu)
- [x] Users page polish: row actions, create/edit admin modal, activate/deactivate/delete confirms

**Done when:** you can create categories/items from the UI, edit a price,
and see it recorded in that item's price history.

**Backend API** (`/api/v1`, JWT + `admin` \| `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Categories | `POST/GET/PATCH/DELETE /categories`, `GET /categories/:id` |
| Items | `POST/GET/PATCH/DELETE /items`, `GET /items?categoryId&isActive`, `PATCH /items/:id/pricing`, `GET /items/:id/price-history` |
| Settings | `GET/PUT /settings/base-reference-price` |

Modules: `src/modules/categories`, `items`, `settings`.

---

## Phase 3 — Customers & Suppliers

**Backend**
- `Customer`, `Supplier` schemas/modules
- CRUD, search by name/phone
- Merge-duplicate-customers endpoint (`دمج أسماء مكررة`)

**Frontend**
- Customers list (sorted by balance, filter "has debt"), total debt at top
- Suppliers list, total owed at top
- Add/edit forms for both, merge-customers UI
- View/expand individual customer/supplier record

**Done when:** you can add customers/suppliers, search them, and merge two
duplicate customers from the UI.

---

## Phase 4 — Sales Invoicing (core feature)

**Backend**
- `SalesInvoice`, `SalesInvoiceLine` schemas/module
- Create invoice (transactional): line totals, discount, paid/remaining
  calc, stock deduction, customer balance update, audit log entry
- List/filter (all / today / week / month) / search by invoice # or customer
- Cancel invoice (transactional reversal of stock + balance effects)
- PDF generation endpoint; WhatsApp share link

**Frontend**
- New-invoice form: customer search-or-cash toggle, multi-line item entry
  with dimension fields shown conditionally for `per_cubic_meter`, live
  totals, discount, paid/remaining
- Invoice list with filters + search
- Invoice detail view; Save / Save & Print; PDF export / WhatsApp share
- Cancel invoice action

**Done when:** you can create a real invoice end-to-end, see stock and (if
applicable) customer debt update correctly, and cancel it with correct
reversal.

---

## Phase 5 — Payments (standalone debt payments)

**Backend**
- `Payment` module for standalone payments against a customer's balance
  (distinct from the payment captured inline during invoice creation in
  Phase 4)

**Frontend**
- "Record payment" action from a customer's detail view
- Payment history per customer

**Done when:** a customer with existing debt can have a partial payment
recorded from the UI and their balance updates correctly.

---

## Phase 6 — Purchasing & Restocking

**Backend**
- `PurchaseInvoice`, `PurchaseInvoiceLine` schemas/module
- Create purchase (transactional: stock increment + supplier `amountOwed`
  increment)

**Frontend**
- New purchase invoice form
- Purchase invoice list per supplier

**Done when:** a purchase from a supplier increases stock and the
supplier's owed amount, both visible in the UI immediately.

---

## Phase 7 — Inventory Management

**Backend**
- Stock list endpoint with computed low/negative stock flags (from
  `reorderThreshold`)
- `StockAdjustment` module (manual جرد correction with reason)
- Inventory valuation (at cost) + distinct item count aggregation

**Frontend**
- Stock list page with low-stock badges/warning icons
- Inline manual stock adjustment with required reason
- Inventory value + item count summary

**Done when:** you can flag/adjust stock manually from the UI and see
low-stock warnings reflect real thresholds.

---

## Phase 8 — Dashboard

**Backend**
- Aggregation endpoints: today's sales / estimated profit / invoice count /
  collected; total outstanding customer debt + customer count; monthly
  sales; top-selling items by revenue

**Frontend**
- Dashboard page: summary cards, monthly sales bar chart, top-selling items,
  "فاتورة جديدة" quick action shortcut

**Done when:** dashboard numbers match what you'd compute manually from the
invoices/payments created in earlier phases.

---

## Phase 9 — Audit Log UI

**Backend**
- Query/filter endpoints over `AuditLog` (by user, action, entity, date) —
  read-only, no mutation endpoints (the collection has been populated since
  Phase 1)

**Frontend**
- Audit log page with filters

**Done when:** every action performed across Phases 1–8 is visible and
correctly attributed in the audit log UI.

---

## Phase 10 — Polish & Hardening

- Full i18n pass (no missed/hardcoded strings in either language)
- Full light/dark pass against `docs/COLORS.md` tokens
- Responsive/mobile pass
- Loading / error / empty states everywhere
- API hardening: rate limiting, input validation edge cases, consistent
  error responses
- Basic e2e tests for the invoice flow (the money-critical path)
- Deployment setup (backend + frontend)

---

## Status tracking

| Phase | Backend | Frontend |
|---|---|---|
| 0 — Foundation | Done | Done |
| 1 — Auth & Users | Done | Done |
| 2 — Categories, Items & Pricing | Done | Done |
| 3 — Customers & Suppliers | Not started | Not started |
| 4 — Sales Invoicing | Not started | Not started |
| 5 — Payments | Not started | Not started |
| 6 — Purchasing & Restocking | Not started | Not started |
| 7 — Inventory Management | Not started | Not started |
| 8 — Dashboard | Not started | Not started |
| 9 — Audit Log UI | Not started | Not started |
| 10 — Polish & Hardening | Not started | Not started |
