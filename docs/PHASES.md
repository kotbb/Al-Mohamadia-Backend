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
and update `docs/DATABASE.md` (backend) / `docs/Design-System.md` (frontend) /
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
- Tailwind theme tokens wired from `docs/Design-System.md` (light/dark CSS variables)
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

- [x] `Category`, `Item`, `ItemPriceHistory` schemas/modules
- [x] CRUD for categories and items (soft delete; category delete blocked when live items exist)
- [x] Price/cost update endpoint that appends to `ItemPriceHistory` + audit `price_changed`
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

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Categories | `POST/GET/PATCH/DELETE /categories`, `GET /categories/:id` |
| Items | `POST/GET/PATCH/DELETE /items`, `GET /items?categoryId&isActive`, `PATCH /items/:id/pricing`, `GET /items/:id/price-history` |

Modules: `src/modules/categories`, `items`.

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

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

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
- [x] Invoice editing (`PATCH /sales-invoices/:id`): transactional stock revert & reapply, customer balance adjustment, in-place payment update, audit `invoice_updated`
- [x] Client-side A4 PDF generation + public tokenized JSON receipt (`GET /public/sales-invoices/:token`) + WhatsApp share payload (`GET .../share`)

**Frontend** — *Done*

- [x] New-invoice modal dialog: customer search-or-cash toggle, multi-line item entry
  with dimension fields shown conditionally for `per_cubic_meter`, live
  totals, discount, paid/remaining
- [x] Invoice list with filters + search, total sales summary card, and primary "فاتورة جديدة" action opening the creation modal
- [x] Invoice detail view; Save / Save & Print (auto-print preview modal); client-side PDF export / WhatsApp share
- [x] Cancel invoice action
- [x] Public receipt page (`/[locale]/invoices/public/[token]`) with client-side print and PDF download

**Done when:** you can create a real invoice end-to-end, see stock and (if
applicable) customer debt update correctly, edit it with atomic stock/balance reconciliation, and cancel it with correct reversals.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Sales Invoices | `POST/GET /sales-invoices`, `GET /sales-invoices/:id`, `PATCH /sales-invoices/:id`, `POST /sales-invoices/:id/cancel` |
| Share & Public Receipt | `GET /public/sales-invoices/:token`, `GET /sales-invoices/:id/share` |

List query params: `status`, `period`, `date`, `q`, `page`, `limit`.
List response: `{ items, meta, summary: { totalAmount } }` (`totalAmount` is saved invoices matching the other filters).
Create body: `{ customerId?, type, lines: [{ itemId, quantity, piecePrice?, width?, length?, thickness?, note? }], discount?, paid?, paymentMethod?, paymentNotes? }`.
Update body: `UpdateSalesInvoiceDto` (same shape as create, validates and reconciles stock, customer balance, and linked payments).

Module: `src/modules/sales-invoices`.

---

## Phase 5 — Payments (standalone debt payments)

**Backend** — *Done*

- [x] Standalone payment endpoint (`POST /payments`) with strict validation:
  `customerId` required, `0 < amount <= customer.balance`, reduces
  `customer.balance` by `amount`, audit `payment_recorded`
- [x] Payment cancellation endpoint (`POST /payments/:id/cancel`):
  only standalone payments (`invoiceId == null`), restores
  `customer.balance`, sets `reversedAt` / `reversedBy`, audit `payment_cancelled`
- [x] List payments endpoint (`GET /payments`): filter by `customerId`, `invoiceId`,
  `status` (`active` | `reversed`), `type` (`standalone` | `on_invoice`),
  `method`, Cairo `period` + `date`, pagination, summary `totalAmount`
- [x] Customer merge re-points standalone `Payment` rows to target in same transaction
- [x] Update invoice creation to capture optional `paymentMethod` and `paymentNotes` when `paid > 0`

**Frontend** — *Done*

- [x] Dedicated Payments list page (`/payments`) with filters (Status, Customer search, Method, Cairo period/date), total collected summary card, and pagination
- [x] "Record payment" modal action from customer detail view with full balance default, method selection, notes, and strict balance validation
- [x] Payment history section on customer detail view showing all payments (standalone + on-invoice)
- [x] Payment cancellation with confirmation dialog and customer debt restoration (disabled with tooltip for on-invoice payments)
- [x] Sidebar updated with "Customer Invoices" / "فواتير المبيعات" rename and "Payments" / "المدفوعات" navigation item
- [x] Full Arabic and English translations with RTL support and design token styling

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

**Backend** — *Done*

- [x] `StockAdjustment` schema & module for manual inventory audit (جرد) with reason
- [x] Transactional stock adjustment updating `Item.stockQuantity` and writing `AuditLog` (`stock_adjusted`, `refCollection: 'StockAdjustment'`)
- [x] Stock list endpoint (`GET /inventory/stock`) with computed low/out-of/negative stock flags, category/search filters, pagination, and KPI summary count badges
- [x] Inventory valuation endpoint (`GET /inventory/valuation`) with total value at cost, at selling price, potential profit, and category breakdowns
- [x] Adjustment history endpoints (`GET /inventory/adjustments`, `GET /inventory/adjustments/:id`)
- [x] Unit test suite covering stock adjustments, listing flags, filters, and valuations

**Frontend** — *Done*

- [x] Dedicated Inventory Management page (`/inventory`) with segmented view toggle between "Current Stock" (مستويات المخزون) and "Adjustment Log" (سجل التسويات والجرد)
- [x] Top 4 KPI Cards with professional SVG line icons: Valuation at Cost, Expected Revenue at Selling Price, Potential Profit & Margin %, and Stock Alerts (clickable alert count badges filtering the stock table)
- [x] "Category Breakdown" modal (`CategoryValuationModal`) displaying cost valuation, selling value, and potential profit per category
- [x] Current stock table with SKU code badges, wood pricing units (`قطعة` / `م³` with 3 decimal precision), stock vs. threshold levels, dynamic status badges (Normal, Low Stock, Out of Stock, Negative), prices, and line valuations
- [x] Stock Adjustment modal (`StockAdjustmentModal`) with wood store common reason presets (`عجز جرد`, `زيادة جرد`, `تالف / كسر`, `تلف رطوبة وتخزين`, `تصحيح خطأ إدخال`), custom notes, live difference badge (+X / -X), and input validation
- [x] Quick Reorder Threshold modal (`ReorderThresholdModal`) to update minimum stock warning levels on the fly
- [x] Adjustment Log table with Cairo-aware timestamps, item code/name, difference badges, old vs. new quantity, adjustment reason, and adjuster username
- [x] Item-specific Adjustment Log history modal (`ItemAdjustmentHistoryModal`) accessible directly from stock row actions
- [x] Cairo Period & Date picker integration for adjustments log (`day`, `week`, `month`, `year`) plus item filter dropdown
- [x] Navigation: Hub 3 (Inventory & Catalog) leads with `/inventory` in sidebar and horizontal `HubTabs` (`/inventory`, `/items`, `/categories`)
- [x] Full bilingual support with comprehensive Arabic & English dictionaries and responsive styling

**Done when:** you can flag/adjust stock manually from the UI and see
low-stock warnings reflect real thresholds.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Stock List | `GET /inventory/stock` |
| Inventory Valuation | `GET /inventory/valuation` |
| Stock Adjustments | `POST /inventory/adjustments` (history is `stock_adjusted` on the audit log) |

List query params (Stock): `categoryId`, `stockStatus`, `q`, `page`, `limit`.
List query params (Adjustments): `itemId`, `period`, `date`, `page`, `limit`.
Adjust body: `{ itemId, newQuantity, reason }`.

Module: `src/modules/inventory`.

---

## Phase 8 — Dashboard

**Backend** — *Done*

- [x] Aggregation endpoint `GET /dashboard`: today's sales (net) / estimated profit / invoice count / collected
- [x] Live customer debt strip: `totalDebt` + `debtorCount` (`balance > 0`)
- [x] Period-filterable `salesSeries` (day / week / month / year, Cairo, zero-filled buckets) + top 5 selling items by revenue
- [x] Defaults to current Cairo month when `period`/`date` omitted; pair-validation matches other list endpoints
- [x] Unit tests for formulas, defaults, validation, and bucket counts

**Frontend** — *Done*

- [x] Dashboard page on `/`: today KPIs, debt strip, period chart + top sellers
- [x] Wired to `GET /dashboard`; period filter + New Invoice header shortcut; debt → customers `?hasDebt=1`

**Done when:** dashboard numbers match what you'd compute manually from the
invoices/payments created in earlier phases.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Dashboard | `GET /dashboard` |

Query params (optional pair): `period` (`day` \| `week` \| `month` \| `year`), `date` (`YYYY-MM-DD`). Default: current Cairo month. Applies only to `salesSeries` + `topSellingItems`.

Response: `{ today: { sales, estimatedProfit, invoiceCount, collected }, debt: { totalDebt, debtorCount }, period: { period, date, from, to }, salesSeries: [{ bucketStart, sales }], topSellingItems: [{ itemId, name, code, quantity, revenue }] }`.

Module: `src/modules/dashboard`.

---

## Phase 9 — Audit Log UI

**Backend**
- [x] Read-only query/filter over `AuditLog` (populated since Phase 1). No mutation endpoints.

**Frontend**
- [x] Audit log page with filters, plus a history modal from module and record screens

**Done when:** every action performed across Phases 1–8 is visible and
correctly attributed in the audit log UI.

`price_changed` writes `changes` as `{ unitPrice: { old, new } }` or `{ cost: { old, new } }`. `stock_adjusted` writes `{ stockQuantity: { old, new }, reason: { old: null, new } }` and names the item in `summary`.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Audit log | `GET /audit-logs` |
| Actors | `GET /audit-logs/actors` |

Query params on `GET /audit-logs` (all optional, AND-combined): `userId`, `action` (exact string), `entityType`, `entityId`, `from`, `to` (`YYYY-MM-DD`, inclusive Cairo calendar days; `from` after `to` is 400), `page` (default 1), `limit` (default 10, max 100). Sort: `createdAt` descending. Paged list endpoints across the API use the same default `limit` of 10 and max of 100.

Response: `{ items: [{ id, createdAt, user: { id, username }, action, entityType, entityId, summary, changes, refCollection, refId }], meta: { page, limit, total } }`. A missing user document keeps the row with `username: null`.

`GET /audit-logs/actors`: `{ id, username }[]` of distinct users who appear on at least one log, including soft-deleted users. A missing user document is `{ id, username: null }`. Sorted by username ascending, null usernames first. Empty when there are no logs.

Module: `src/modules/audit` (backend).

---

## Phase 10 — Polish & Hardening

- Full i18n pass (no missed/hardcoded strings in either language)
- Full light/dark pass against `docs/Design-System.md` tokens
- Responsive/mobile pass
- Loading / error / empty states everywhere
- API hardening: rate limiting, input validation edge cases, consistent
  error responses
- Zero backend cold-start footprint: Invoice printing and PDF downloads run
  entirely client-side on the frontend via HTML5 print and `html2pdf.js`,
  eliminating heavy Chromium and Puppeteer headless browser dependencies from
  the backend and avoiding Vercel serverless execution timeout limits.
- Preview deploy: personal Vercel Hobby (one project per repo, hosts from
  env) and portable Compose. Compose reads each repo's `.env`. On Vercel,
  `MONGO_URI` ends in `/prod`.

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
| 7 — Inventory Management | Done | Done |
| 8 — Dashboard | Done | Done |
| 9 — Audit Log UI | Done | Done |
| 10 — Polish & Hardening | Done | Done |
