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

- [x] Items list grouped by category, search/filters
- [x] Categories list page (create/edit modal, activate/deactivate/delete; delete blocked when items exist)
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

**Backend** — *Done*

- [x] `Customer`, `Supplier` schemas/modules
- [x] CRUD, search by name/phone, pagination, `hasDebt` filter, debt summaries
- [x] Create-only opening `balance` / `amountOwed` (not writable on PATCH)
- [x] Soft-delete blocked when outstanding debt ≠ 0
- [x] Merge-duplicate endpoints for customers **and** suppliers (`دمج أسماء مكررة`)
- [x] Dev seed script: `npm run seed:parties`
- [x] Soft-delete audit actions: `category_deleted` / `item_deleted` / `customer_deleted` / `supplier_deleted`

**Frontend** — *Done*

- [x] Customers list (sorted by balance, filter "has debt"), total debt + debtor count
- [x] Suppliers list, total owed at top
- [x] Add/edit modals for both (create-only opening balance/amount owed; optional address)
- [x] Detail pages (identity + balance/owed; no invoice/payment history in Phase 3)
- [x] Multi-source merge UI for customers and suppliers

**Done when:** you can add customers/suppliers, search them, and merge multiple
duplicate customers into one from the UI.

**Backend API** (`/api/v1`, JWT + `admin` \| `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Customers | `POST/GET/PATCH/DELETE /customers`, `GET /customers/:id`, `POST /customers/merge` |
| Suppliers | `POST/GET/PATCH/DELETE /suppliers`, `GET /suppliers/:id`, `POST /suppliers/merge` |

List query params: `q`, `hasDebt`, `isActive`, `page`, `limit`. List response: `{ items, meta, summary }` (`totalDebt` / `totalOwed`).

Merge body: `{ targetId, sourceIds: string[], name?, phone? }` — keeps target, soft-deletes all sources, sums balances / amountOwed.

Modules: `src/modules/customers`, `suppliers`.

---

## Phase 4 — Sales Invoicing (core feature)

**Backend** — *Done*

- [x] `SalesInvoice`, `SalesInvoiceLine`, `Payment`, `InvoiceCounter` schemas/module
- [x] Create invoice (transactional): line totals, discount, paid/remaining
  calc, stock deduction, customer balance update, on-invoice Payment when
  `paid > 0`, audit `invoice_created`
- [x] List/filter (`period` + `date` in Africa/Cairo: day/week/month/year;
  week Sat–Fri) / search by invoice # or customer; optional `status`
- [x] Cancel invoice (transactional reversal of stock + balance; void
  payments via `reversedAt` / `reversedBy`)
- [x] Customer merge re-points `SalesInvoice` / `Payment` to target
- [x] Dev seed: `npm run seed:invoices`
- [x] PDF generation (`GET .../pdf`) + public tokenized PDF
  (`GET /public/sales-invoices/:token/pdf`) + WhatsApp share payload
  (`GET .../share`)

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

**Backend API** (`/api/v1`, JWT + `admin` \| `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Sales invoices | `POST/GET /sales-invoices`, `GET /sales-invoices/:id`, `POST /sales-invoices/:id/cancel`, `GET /sales-invoices/:id/pdf`, `GET /sales-invoices/:id/share` |
| Public PDF | `GET /public/sales-invoices/:token/pdf` (no JWT; token = `pdfShareToken`) |

List query params: `q`, `status`, `period`, `date`, `page`, `limit`.
Create body: `{ type, customerId?, lines[], discount?, paid }`.
Share response: `{ pdfUrl, whatsappUrl, message }`.

Module: `src/modules/sales-invoices`.

---

## Phase 5 — Payments (standalone debt payments)

**Backend** — *Done*

- [x] `Payment` module for standalone payments against a customer's balance
  (distinct from the payment captured inline during invoice creation in
  Phase 4)
- [x] Support `PaymentMethod` enum (`cash`, `instapay`, `vodafone_cash`, `bank_transfer`, `check`) + optional `notes`
- [x] Strict balance validation: `0 < amount <= customer.balance`, blocked if `balance <= 0`
- [x] Standalone payment cancellation (`POST /payments/:id/cancel`) restoring balance + auditing `payment_cancelled`
- [x] Filterable listing (`GET /payments`) by `customerId`, `invoiceId`, `status`, `type`, `method`, Cairo `period` + `date`
- [x] Update invoice creation to capture optional `paymentMethod` and `paymentNotes` when `paid > 0`

**Frontend** — *Done*
- [x] "Record payment" action from a customer's detail view
- [x] Payment history per customer
- [x] Dedicated payments list page with filters and total summary

**Done when:** a customer with existing debt can have a partial payment
recorded from the UI and their balance updates correctly.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Payments | `POST/GET /payments`, `GET /payments/:id`, `POST /payments/:id/cancel` |

List query params: `customerId`, `invoiceId`, `status`, `type`, `method`, `period`, `date`, `page`, `limit`.
Create body: `{ customerId, amount, method?, notes? }`.
List response: `{ items, meta, summary: { totalAmount } }`.

Module: `src/modules/payments`.

---

## Phase 6 — Purchasing & Restocking (including Supplier Payments)

**Backend** — *Done*

- [x] `PurchaseInvoice`, `PurchaseInvoiceLine` schemas/module
- [x] Create purchase (transactional: pricing-mode-aware stock increment + supplier `amountOwed += remaining`, on-purchase `SupplierPayment` when `paid > 0`, audit `purchase_created`)
- [x] Sequential purchase numbering `PUR-NNNN` via `InvoiceCounter`
- [x] Cancel purchase invoice (transactional: reverses stock + supplier `amountOwed`, voids associated `SupplierPayment` records, status `cancelled`, audit `purchase_cancelled`)
- [x] List purchase invoices with filters (`supplierId`, `status`, `period` + `date`, `q`) and active summary (`totalAmount`)
- [x] `SupplierPayment` schema & module (`src/modules/supplier-payments`):
  - Standalone debt settlement (`POST /supplier-payments`): strict validation `0 < amount <= supplier.amountOwed`, reduces `amountOwed`
  - Payment cancellation (`POST /supplier-payments/:id/cancel`): restores `amountOwed`, sets `reversedAt` / `reversedBy`, audits `supplier_payment_cancelled`
  - Filterable list (`GET /supplier-payments`): by `supplierId`, `purchaseId`, `status`, `type`, `method`, Cairo `period` + `date`
- [x] Supplier merge re-points both `PurchaseInvoice.supplierId` and `SupplierPayment.supplierId` to target in the same transaction
- [x] Unit test suites covering critical paths, role guards, validation, cancel, and merge re-pointing

**Frontend** — *Done*
- [x] Dedicated Purchase Invoices list page (`/purchases`) with status/period/search filters, total purchases summary card, and pagination
- [x] Modal-based new purchase invoice dialog matching customer invoice creation, with supplier picker, item selector with cubic-meter dimension calculation, live totals, and on-purchase payment
- [x] View-only purchase invoice detail dialog/view with line items and transactional cancellation
- [x] Dedicated Supplier Payments list page (`/supplier-payments`) with Cairo period/date filters, method filter, supplier search, summary card, and pagination
- [x] "Record payment" modal action with debtor supplier droplist and live autocomplete search
- [x] Supplier detail view enhanced with purchase history, payments history, and quick record payment action
- [x] Customer "Record payment" modal enhanced with debtor customer droplist and live autocomplete search
- [x] Contextual navigation: "Back to list" returns to originating list (`/payments`, `/supplier-payments`, `/purchases`) via `?from=...` query parameter
- [x] 3-Hub navigation structure in sidebar and horizontal tab bar: Sales & Customers, Procurement & Suppliers, Inventory & Catalog
- [x] Complete bilingual Arabic / English translations and responsive token-based styling

**Done when:** a purchase from a supplier increases stock and the
supplier's owed amount, supplier payments can be recorded and cancelled, both visible in the UI immediately.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Purchases | `POST/GET /purchases`, `GET /purchases/:id`, `POST /purchases/:id/cancel` |
| Supplier payments | `POST/GET /supplier-payments`, `GET /supplier-payments/:id`, `POST /supplier-payments/:id/cancel` |

List query params (Purchases): `supplierId`, `status`, `period`, `date`, `q`, `page`, `limit`.
Create body (Purchases): `{ supplierId, lines: [{ itemId, quantity, unitCost, width?, length?, thickness?, note? }], paid?, paymentMethod?, paymentNotes?, notes? }`.
List query params (Supplier payments): `supplierId`, `purchaseId`, `status`, `type`, `method`, `period`, `date`, `page`, `limit`.
Create body (Supplier payments): `{ supplierId, amount, method?, notes? }`.
List response: `{ items, meta, summary: { totalAmount } }`.

Modules: `src/modules/purchases`, `src/modules/supplier-payments`.

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
| 3 — Customers & Suppliers | Done | Done |
| 4 — Sales Invoicing | Done | Done |
| 5 — Payments | Done | Done |
| 6 — Purchasing & Restocking | Done | Done |
| 7 — Inventory Management | Not started | Not started |
| 8 — Dashboard | Not started | Not started |
| 9 — Audit Log UI | Not started | Not started |
| 10 — Polish & Hardening | Not started | Not started |
