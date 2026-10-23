# Implementation Phases

> Both repositories keep this system plan for local context. Repository-specific
> implementation notes may differ; keep shared API contracts, feature status
> and planned work aligned between the two copies.

This project is built as a series of **vertical slices**: each phase
delivers a complete, end-to-end feature (DB schema → NestJS module → Next.js
pages), validated by automated backend/frontend checks and user-run manual
frontend verification. Browser access is not part of agent verification unless
explicitly requested. Do not build "the whole backend"
then "the whole frontend" — and do not silently expand a phase's scope.

Update this file's checkboxes/status as phases complete (in both copies),
and update `docs/DATABASE.md` (backend) / `docs/DESIGN-SYSTEM.md` (frontend) /
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
- Tailwind theme tokens wired from `docs/DESIGN-SYSTEM.md` (light/dark CSS variables)
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
- Login, refresh, logout; super-admin account creation through `POST /users` (no registration endpoint)
- JWT access + refresh token issuance/rotation (hashed refresh token storage)
- Role guards: `super_admin`, `admin`
- Initial super-admin provisioning is external; no first-user seed script exists in this checkout

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
- Former development seed removed; create example records through the application/API.

**Frontend** — *Done*

- [x] Items list grouped by category, search/filters
- [x] Categories list page (create/edit modal, activate/deactivate/delete; delete blocked when items exist)
- [x] Add/edit item **pages** (pricing mode toggle; name and category, no item code)
- [x] Price history **modal** per item
- [x] Soft-delete item with confirmation (row actions kebab menu)
- [x] Users page polish: row actions, create/edit admin modal, activate/deactivate/delete confirms

**Done when:** you can create categories/items from the UI, edit a price,
and see it recorded in that item's price history.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Categories | `POST/GET /categories`, `GET/PATCH/DELETE /categories/:id` |
| Items | `POST/GET /items`, `GET/PATCH/DELETE /items/:id`, `POST /items/:id/dimension-defaults`, `PATCH /items/:id/pricing`, `GET /items/:id/price-history` |

Modules: `src/modules/categories`, `items`.

---

## Phase 3 — Customers & Suppliers

**Backend** — *Done*

- [x] `Customer`, `Supplier` schemas/modules
- [x] CRUD, customer search by name only (supplier search retains name/phone), pagination, `hasDebt` filter, debt summaries
- [x] Optional starting and editable current `balance` / `amountOwed`, with automatic adjustment audit
- [x] Soft-delete blocked when outstanding debt ≠ 0
- [x] Merge-duplicate endpoints for customers **and** suppliers (`دمج أسماء مكررة`)
- Former development seed removed; create example records through the application/API.
- [x] Soft-delete audit actions: `category_deleted` / `item_deleted` / `customer_deleted` / `supplier_deleted`

**Frontend** — *Done*

- [x] Customers list (sorted by balance, filter "has debt"), total debt + debtor count
- [x] Suppliers list, total owed at top
- [x] Add/edit modals for both (optional starting balance and editable current balance; optional address)
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
- Former development seed removed; create example records through the application/API.
- [x] Invoice editing (`PATCH /sales-invoices/:id`): transactional stock revert & reapply, customer balance adjustment, in-place payment update, audit `invoice_updated`
- [x] Client-side A4 PDF generation + public tokenized JSON receipt (`GET /public/sales-invoices/:token`) + WhatsApp share payload (`GET .../share`)
- [x] Authenticated self-contained receipt (`GET /sales-invoices/:id/receipt`) and numeric/same-customer neighbors (`GET /sales-invoices/:id/neighbors`); existing public links remain valid

**Frontend** — *Done*

- [x] New-invoice page: customer search-or-cash toggle, multi-line item entry
  with optional piece dimensions and required cubic dimensions, live
  totals, discount, paid/remaining
- [x] Invoice list with filters + search, total sales summary card, and primary "فاتورة جديدة" action opening `/invoices/new`
- [x] Invoice detail view; Save returns to detail; Save & Print opens export with PNG A5 default, PDF A4, price visibility, print and sharing
- [x] Cancel invoice action
- [x] Public receipt page (`/[locale]/invoices/public/[token]`) with client-side print and PDF download

**Done when:** you can create a real invoice end-to-end, see stock and (if
applicable) customer debt update correctly, edit it with atomic stock/balance reconciliation, and cancel it with correct reversals.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Sales Invoices | `POST/GET /sales-invoices`, `GET /sales-invoices/:id`, `PATCH /sales-invoices/:id`, `POST /sales-invoices/:id/cancel` |
| Receipt and navigation | `GET /sales-invoices/:id/receipt`, `GET /sales-invoices/:id/neighbors` |
| Legacy Share & Public Receipt | `GET /public/sales-invoices/:token`, `GET /sales-invoices/:id/share` |

List query params: `q`, `customerId`, `status`, `period`, `date`, `from`, `to`, `page`, `limit`.
List response: `{ items, meta, summary: { totalAmount } }` (`totalAmount` is saved invoices matching the other filters).
Create body: `{ customerId?, type, lines: [{ itemId, quantity, piecePrice, width?, length?, thickness?, note? }], discount?, paid, accountPaymentAmount?, paymentMethod?, paymentNotes? }`. `customerId` is required for customer sales. API `paid` is capped at net; the frontend splits entered excess into the independent `accountPaymentAmount`.
Line dimensions `width`, `length`, and `thickness` are meters.
Update body: `UpdateSalesInvoiceDto` (same shape as create, validates and reconciles stock, customer balance, and linked payments).

Module: `src/modules/sales-invoices`.

---

## Phase 5 — Payments (standalone debt payments)

**Backend** — *Done*

- [x] Standalone payment endpoint (`POST /payments`) with strict validation:
  `customerId` required, positive finite two-decimal `amount` with no debt cap, reduces
  `customer.balance` by `amount`, audit `payment_recorded`
- [x] Payment cancellation endpoint (`POST /payments/:id/cancel`):
  only standalone payments (`invoiceId == null`), restores
  `customer.balance`, sets `reversedAt` / `reversedBy`, audit `payment_cancelled`
- [x] List payments endpoint (`GET /payments`): filter by `customerId`, `invoiceId`,
  `status` (`active` | `reversed` | `all`), `type` (`standalone` | `invoice` | `all`),
  `method`, Cairo `period` + `date`, pagination, summary `totalAmount`
- [x] Customer merge re-points standalone `Payment` rows to target in same transaction
- [x] Update invoice creation to capture optional `paymentMethod` and `paymentNotes` when `paid > 0`

**Frontend** — *Done*

- [x] Dedicated Payments list page (`/payments`) with filters (Status, Customer search, Method, Cairo period/date), total collected summary card, and pagination
- [x] "Record payment" modal action from customer detail view with positive debt as its initial amount (blank for zero/credit), method selection, notes, and money validation; active accounts can pay beyond debt
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

List query params: `customerId`, `invoiceId`, `status`, `type`, `method`, `period`, `date`, `from`, `to`, `page`, `limit`.
Create body: `{ customerId, amount, method?, notes? }`.
List response: `{ items, meta, summary: { totalAmount } }`.

Module: `src/modules/payments`.

---

## Phase 6 — Purchasing & Restocking (including Supplier Payments)

**Backend** — *Done*

- [x] `PurchaseInvoice`, `PurchaseInvoiceLine` schemas/module
- [x] Create purchase (transactional: pricing-mode-aware stock increment + supplier `amountOwed += remaining`, on-purchase `SupplierPayment` when `paid > 0`, audit `purchase_created`)
- [x] Edit saved purchase (`PATCH /purchases/:id`): replace supplier/lines/paid/notes with transactional stock, debt, linked-payment reconciliation and `purchase_updated` audit
- [x] Sequential purchase numbering `PUR-NNNN` via `InvoiceCounter`
- [x] Cancel purchase invoice (transactional: reverses stock + supplier `amountOwed`, voids associated `SupplierPayment` records, status `cancelled`, audit `purchase_cancelled`)
- [x] List purchase invoices with filters (`supplierId`, `status`, `period` + `date`, `q`) and active summary (`totalAmount`)
- [x] `SupplierPayment` schema & module (`src/modules/supplier-payments`):
  - Standalone debt settlement (`POST /supplier-payments`): positive finite two-decimal amount, no debt cap, active supplier required; reduces `amountOwed` and can create credit
  - Payment cancellation (`POST /supplier-payments/:id/cancel`): restores `amountOwed`, sets `reversedAt` / `reversedBy`, audits `supplier_payment_cancelled`
  - Filterable list (`GET /supplier-payments`): by `supplierId`, `purchaseInvoiceId`, `status`, `type`, `method`, Cairo `period` + `date`
- [x] Supplier merge re-points both `PurchaseInvoice.supplierId` and `SupplierPayment.supplierId` to target in the same transaction
- [x] Unit test suites covering critical paths, role guards, validation, cancel, and merge re-pointing

**Frontend** — *Done*

- [x] Dedicated Purchase Invoices list page (`/purchases`) with status/period/search filters, total purchases summary card, and pagination
- [x] Dedicated purchase create/edit pages with supplier picker, category-grouped item choices, meter dimensions, live totals, and invoice/account payment allocation
- [x] Purchase detail with line items, editing and transactional cancellation
- [x] Dedicated Supplier Payments list page (`/supplier-payments`) with Cairo period/date filters, method filter, supplier search, summary card, and pagination
- [x] "Record payment" modal action with active supplier droplist (including zero/credit balances) and live autocomplete search
- [x] Supplier detail view enhanced with purchase history, payments history, and quick record payment action
- [x] Customer "Record payment" modal enhanced with active customer droplist (including zero/credit balances) and live autocomplete search
- [x] Contextual navigation: "Back to list" returns to originating list (`/payments`, `/supplier-payments`, `/purchases`) via `?from=...` query parameter
- [x] 3-Hub navigation structure in sidebar and horizontal tab bar: Sales & Customers, Purchases & Suppliers, Inventory & Catalog
- [x] Complete bilingual Arabic / English translations and responsive token-based styling

**Done when:** a purchase from a supplier increases stock and the
supplier's owed amount, supplier payments can be recorded and cancelled, both visible in the UI immediately.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Purchases | `POST/GET /purchases`, `GET/PATCH /purchases/:id`, `POST /purchases/:id/cancel` |
| Supplier payments | `POST/GET /supplier-payments`, `GET /supplier-payments/:id`, `POST /supplier-payments/:id/cancel` |

List query params (Purchases): `supplierId`, `status`, `period`, `date`, `from`, `to`, `q`, `page`, `limit`.
Create body (Purchases): `{ supplierId, lines: [{ itemId, quantity, unitCost, width?, length?, thickness?, note? }], paid?, accountPaymentAmount?, existingDebtPayment?, notes? }`. `existingDebtPayment` is a create-only alias, mutually exclusive with `accountPaymentAmount`. PATCH requires `supplierId`, `lines`, and `paid`, with optional `accountPaymentAmount` and `notes`. Purchase invoice payments use cash and invoice notes; `paymentMethod`/`paymentNotes` are not accepted purchase fields.
Line dimensions `width`, `length`, and `thickness` are meters.
List query params (Supplier payments): `supplierId`, `purchaseInvoiceId`, `status`, `type`, `method`, `period`, `date`, `from`, `to`, `page`, `limit`.
Create body (Supplier payments): `{ supplierId, amount, method?, notes? }`.
List response: `{ items, meta, summary: { totalAmount } }`.

Modules: `src/modules/purchases`, `src/modules/supplier-payments`.

---

## Phase 7 — Inventory Management

**Backend** — *Done*

- [x] `StockAdjustment` schema & module for manual inventory audit (جرد) with reason
- [x] Transactional stock adjustment updating `Item.stockQuantity` and writing `AuditLog` (`stock_adjusted`, `refCollection: 'StockAdjustment'`)
- [x] Stock list endpoint (`GET /inventory/stock`) with computed low/out-of/negative stock flags, category/search filters, pagination, and KPI summary count badges
- [x] Inventory category pagination (`paginationMode=categories`, UI limit 5) keeps every matching category complete, preserves category creation-date ascending order and KPI semantics, and retains legacy item-based API pagination.
- [x] Inventory valuation endpoint (`GET /inventory/valuation`) with total value at cost, at selling price, potential profit, and category breakdowns
- [x] Adjustment history reads `stock_adjusted` entries through `GET /audit-logs`; there are no GET inventory-adjustment endpoints
- [x] Unit test suite covering stock adjustments, listing flags, filters, and valuations

**Frontend** — *Done*

- [x] Dedicated Inventory Management page (`/inventory`) with segmented view toggle between "Current Stock" (مستويات المخزون) and "Adjustment Log" (سجل التسويات والجرد)
- [x] Top 4 KPI Cards with professional SVG line icons: Valuation at Cost, Expected Revenue at Selling Price, Potential Profit & Margin %, and Stock Alerts (clickable alert count badges filtering the stock table)
- [x] "Category Breakdown" modal (`CategoryValuationModal`) displaying cost valuation, selling value, and potential profit per category
- [x] Current stock table with item names, wood pricing units (`قطعة` / `م³` with 3 decimal precision), stock vs. threshold levels, dynamic status badges (Normal, Low Stock, Out of Stock, Negative), prices, and line valuations
- [x] Stock Adjustment modal (`StockAdjustmentModal`) with wood store common reason presets (`عجز جرد`, `زيادة جرد`, `تالف / كسر`, `تلف رطوبة وتخزين`, `تصحيح خطأ إدخال`), custom notes, live difference badge (+X / -X), and input validation
- [x] Quick Reorder Threshold modal (`ReorderThresholdModal`) to update minimum stock warning levels on the fly
- [x] Adjustment Log table with Cairo-aware timestamps, item name, difference badges, old vs. new quantity, adjustment reason, and adjuster username
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
Adjustment history uses audit filters: `action=stock_adjusted`, `entityType=Item`,
`entityId` (optional item), inclusive Cairo `from`/`to`, `page`, `limit`.
Adjust body: `{ itemId, newQuantity, reason }`.

Module: `src/modules/inventory`.

---

## Phase 8 — Dashboard

**Backend** — *Done*

- [x] Aggregation endpoint `GET /dashboard`: today's sales (net) / estimated profit / invoice count / collected
- [x] Live customer debt KPI: `totalDebt` + `debtorCount` (`balance > 0`)
- [x] Period-filterable `salesSeries` (day / week / month / year, Cairo, zero-filled buckets) + top 5 selling items by revenue
- [x] Defaults to current Cairo month when `period`/`date` omitted; pair-validation matches other list endpoints
- [x] Unit tests for formulas, defaults, validation, and bucket counts

**Frontend** — *Done*

- [x] Dashboard page on `/`: today KPIs, debt KPI, period chart + top sellers
- [x] Wired to `GET /dashboard`; period filter + New Invoice header shortcut; debt → customers `?hasDebt=1`

**Done when:** dashboard numbers match what you'd compute manually from the
invoices/payments created in earlier phases.

**Backend API** (`/api/v1`, JWT + `admin` | `super_admin`):

| Resource | Endpoints |
|----------|-----------|
| Dashboard | `GET /dashboard` |

Query params: `period` (`day` \| `week` \| `month` \| `year`) with `date`
(`YYYY-MM-DD`), or custom inclusive Cairo `from`/`to`. Default: current Cairo
month. The selected range applies to `periodFinancials`, `salesSeries` and
`topSellingItems`; today and live debt KPIs remain independent.

Response: `{ today: { sales, estimatedProfit, invoiceCount, collected }, periodFinancials: { sales, estimatedGrossProfit }, debt: { totalDebt, debtorCount }, period: { period, date, from, to }, salesSeries: [{ bucketStart, sales }], topSellingItems: [{ itemId, name, quantity, revenue }] }`. `today.estimatedProfit` retains its gross-profit meaning. Free-amount sales contribute to sales and gross profit but not item quantity rankings. Saved free-amount purchase line totals reduce gross profit in their purchase creation period; payments do not deduct the amount again and cancelled purchases are excluded. Custom ranges return `period.period = "custom"`.

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

## Free-amount sales/purchases and expense retirement

- [x] `free_amount` (مبلغ حر) is a third, immutable item pricing mode. Item creation
  needs a name and category; price, cost, dimensions, stock, and reorder
  threshold are not editable for this mode.
- [x] Cash and customer invoices accept a positive EGP amount and optional note
  for each free-amount line. The server stores quantity 1 and `piecePrice` equal
  to the amount, recalculates totals, snapshots zero cost, and skips stock changes.
  Purchase forms also accept one positive amount as `unitCost`, canonical quantity 1, and no dimensions; neither flow changes stock. Inventory still excludes these items.
- [x] Mixed receipts leave quantity, dimensions, and unit price blank for these
  lines. Displayed quantity/cubic totals and unit rankings count physical goods
  only; charges remain in sales and gross profit.
- [x] Existing gross profit is net sales minus stocked-item sales costs and saved free-amount purchase totals, filtered independently by invoice creation dates in the Cairo reporting period. No sale/purchase matching, catalog prices, or extra dashboard cards are introduced.
- [x] Operating-expense UI/API and expense-dependent dashboard fields are retired.
  Historical audit records remain. No cleanup command is shipped; retired collections are left untouched. Any future cleanup requires a separately reviewed maintenance operation.
- [x] Custom inclusive Cairo `from`/`to` ranges remain available for invoices,
  customer payments, purchases, supplier payments, and dashboard.

## Phase 10 — Polish & Hardening

- Full i18n pass (no missed/hardcoded strings in either language)
- Full light/dark pass against `docs/DESIGN-SYSTEM.md` tokens
- Responsive/mobile pass
- Loading / error / empty states everywhere
- API hardening: rate limiting, input validation edge cases, consistent
  error responses
- No backend receipt renderer: Invoice printing and PDF downloads run
  entirely client-side on the frontend via HTML5 print and `html2pdf.js`,
  without an API rendering job. The current API Dockerfile still contains legacy
  Chromium installation; container cleanup/deployment validation is separate.
- Deployment configuration must be verified for the selected runtime. The checkout includes Compose; no backend `vercel.json` is present. No deployment is performed by documentation or build checks.

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
| 10 — Polish & Hardening | Implemented; runtime validation pending | Implemented; manual visual checks pending |

### Compact inventory and invoice dimension additions

- [x] Compact inventory category tables retain eight columns, counts for the current page, existing actions, filters and pagination.
- [x] Localized item creation/edit pages replace catalog form modals.
- [x] Shared dashed Add line/Add value buttons and invoice preset addition for sales create/edit and purchase create.
- [x] POST /api/v1/items/:id/dimension-defaults appends positive meter defaults transactionally with item-edit auditing; duplicates are no-ops.
- [ ] Manual visual/interaction checks in both languages and on mobile (browser access intentionally skipped).

## Current workflow additions

- [x] Invoice export page defaults to PNG A5; PDF A4, price visibility, printing and sharing remain available.
- [x] Shared loading screen for route/auth transitions; global/localized error and not-found surfaces.
- [x] Root AGENTS.md is the single instruction file in each repository; architecture checks run before builds.
- [ ] Manual English/Arabic, light/dark and mobile verification remains separate from automated checks.

## Navigation and receipt presentation

- [x] Invoice-first Sales & Customers and Purchases & Suppliers hubs; clickable customer/supplier/sales/purchase rows retain independent nested actions and brown primary-link hover.
- [x] Numeric invoice neighbors supplement existing customer chronology with cancelled/cash invoices, gap handling and numeric collation.
- [x] Resolved receipt pricing snapshots support cubic per-piece display without changing stored rates/totals.
- [ ] Manual language/mobile/hover/export checks remain separate from automated verification.


### Validation and invoice navigation refinement

Implemented optional Egyptian mobile validation, preserved unchanged legacy phones, partial phone indexes (no phone-index maintenance script is shipped), trimmed required-text/null guards, consistent account/item monetary precision, and finite positive cubic write guards across the two repositories. Invoice navigation uses a mode selector and labeled Previous/Next arrows; Arabic PDF guidance is also shown on public receipts and excluded from printed/downloaded output. Existing records are not rewritten. Manual English/Arabic/mobile checks remain user-run.

### DTO organization

All feature DTO directories separate incoming body/query contracts into
`dto/request/` and returned contracts into `dto/response/`. Nested input DTOs
stay with requests. Controllers, services, tests and cross-feature imports use
the new paths. This refactor preserves validation, API payloads and persistence.


### Current locale and phone controls

- Arabic/RTL is the unprefixed default with locale detection disabled; explicit
  English routes remain LTR. Theme and language switches live in the user menu.
- Optional Egyptian mobiles accept local/+20 formats and use English digits.
  The ten-digit international portion keeps generic `1XX XXX XXXX` guidance.
  Errors appear on invalid submit attempts, not while typing or on blur.


## Account details and independent invoice/account payments (October 2026)

- Customer and supplier details show three KPIs: lifetime net invoiced total, active payments, and current debt/credit. Invoice and payment histories remain separate and paginated. Contact displays and detail-page merge controls are removed; existing contact editing and other merge entry points remain.
- New invoice links preselect the account; payment/edit actions are in the header. Account action buttons are removed from detail pages; lifecycle/delete remain available on list pages. Customer detail invoice history omits its redundant customer column.
- One Balance field uses customer `balance` and supplier `amountOwed` on create and PATCH. Creation accepts an optional starting amount; editing sets the actual current amount. Signed finite two-decimal values support debt and credit. Automatic audit includes old/new values and the adjustment difference in the same transaction; invoices and payments remain unchanged. Contact-only edits omit an unchanged balance. No opening-balance field, migration, derivation, or backfill remains; existing records are untouched.
- Sales and purchase creation/editing have one entered paid amount, split automatically into invoice payment and excess account payment. Remaining never falls below zero; an inline message explains the excess. API `paid` remains capped by invoice net. `accountPaymentAmount` is independent, may exceed account debt, and creates a standalone payment in the same transaction. Purchase create retains `existingDebtPayment` as an exclusive compatibility alias.
- Invoice details/modal/receipt/print/PDF show invoice paid plus active origin-linked account payments, with a conditional invoice/previous-debt breakdown. Remaining continues to use invoice paid only. Additional account payments persist through invoice edits, reassignment, and cancellation and can be cancelled separately.
- Standalone payments allow advance credit on active accounts with no debt or existing credit. Credit offsets future account charges without allocating payment to future invoices.
- Verification: architecture checks/tests, frontend form/receipt tests, backend unit and temporary MongoDB replica-set tests, builds and lint; manual UI checklist without agent browser access.

Sales creation defaults to Customer Sale, with a single searchable customer selection field rather than separate search and select controls.


Additional account payments now retain source-invoice provenance (`Payment.sourceInvoiceId`, `SupplierPayment.sourcePurchaseInvoiceId`) separately from lifecycle links. Invoice/public responses expose active same-party `accountPaymentAmount`; the UI combines it with invoice `paid` for display only. Earlier payments without provenance are not inferred or backfilled from matching timestamps/amounts. Selected customers use the same muted summary panel as suppliers and a Change customer action to reopen the single search dropdown.


Payment-history notes distinguish additional account payments while preserving user memos and split rows. Receipt, export, preview and detail breakdowns isolate the numeric expression for RTL and keep the extra amount attached to its previous-debt label; receipt paid totals align beneath the invoice amount with brackets alongside.

### Name-only customer lookup and searchable sales items (October 2026)

- Customer listing search (`q`) matches escaped customer names only. Sales creation, customer management, and customer-payment searches use that same contract; phone numbers remain editable contact data.
- Sales invoice item selection searches item or category names inside one keyboard-accessible dropdown, retaining the chosen item and its line settings until another choice is confirmed. Active items and an existing inactive selection are supported.
- Sales summary places Paid amount before Discount in locale reading order, including on narrow screens. Existing payment allocation calculations are unchanged.

### Item codes removed

- [x] Item APIs and forms use names and category selection without an item code. References continue using database IDs; duplicate item names remain allowed.
- [x] Items and Inventory search by item name only; invoice selectors retain item/category-name search. Inventory and dashboard top-selling-item responses no longer include a code.
- [x] Legacy database fields and their single-field index are removed only by the manual cleanup procedure, never automatically at application startup. Historical audit records remain unchanged.
