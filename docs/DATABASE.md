# Database Schema — MongoDB

This document is the source of truth for the data model. It is derived from
the original `Database.pdf` spec plus the fields implied by `Features.pdf`
(marked as *(added)* below). Update this file in the same PR whenever a
schema changes.

## Conventions

- All collections use `_id: ObjectId` as primary key.
- Every collection has `createdAt`; add `updatedAt` too (Mongoose
  `timestamps: true`) even where the source spec only listed `createdAt`.
- **Soft delete** (`isDeleted: boolean`, default `false`) + `isActive` on
  mutable master data: `Category`, `Customer`, `Supplier`, `User`, `Item`.
- **Immutable / append-only, never updated or deleted**: `ItemPriceHistory`,
  `StockAdjustment`, `AuditLog`.
- **Hard deleted**: `RefreshToken` only — on logout, expiry, or rotation.
- Money fields are plain numbers in EGP (ج.م). Round to 2 decimals at write
  time; never trust client-computed totals — recompute server-side.
- Denormalized running totals (`Customer.balance`, `Supplier.amountOwed`,
  invoice `paid` / `remaining`) must be updated transactionally alongside
  the operation that changes them (invoice save/cancel, payment, purchase).

---

## Customer

| Field | Type | Notes |
|---|---|---|
| name | string | required |
| phone | string | required, used for search; normalized (trim + strip spaces/dashes) |
| address | string \| null | optional; trimmed; empty string stored as null |
| balance | number | denormalized running debt (مديونية), default 0; settable **only on create** as opening balance (≥ 0); never accepted on PATCH |
| isActive | boolean | deactivation flag (allowed even when balance ≠ 0) |
| isDeleted | boolean | soft delete; blocked when `balance !== 0` |
| createdAt / updatedAt | date | |

**Relationships:** 1 → many `SalesInvoice`, 1 → many `Payment`.
**Indexes:** unique index on `phone` (scoped to non-deleted docs), compound
index on `name` + `phone` for search, index on `balance` for sort/filter.
**Merge:** `POST /customers/merge` keeps `targetId`, sums `balance` from
one or more `sourceIds`, optional name/phone overrides on target, soft-deletes
all sources; audits `customer_merged`. Re-points `SalesInvoice` and `Payment`
`customerId` from each source to the target in the same transaction.

---

## Supplier

| Field | Type | Notes |
|---|---|---|
| name | string | required |
| phone | string \| null | optional; when set, unique among non-deleted; normalized like customer phone |
| address | string \| null | optional; trimmed; empty string stored as null |
| amountOwed | number | denormalized running total, default 0; settable **only on create** (≥ 0); never accepted on PATCH |
| isActive | boolean | deactivation allowed even when amountOwed ≠ 0 |
| isDeleted | boolean | soft delete; blocked when `amountOwed !== 0` |
| createdAt / updatedAt | date | |

**Relationships:** 1 → many `PurchaseInvoice`, 1 → many `SupplierPayment`.
**Indexes:** partial unique on `phone` where non-deleted and phone is a
string; index on `amountOwed`; compound `name` + `phone`.
**Merge:** same multi-source rules as customers via `POST /suppliers/merge`
(`supplier_merged` with `sourceIds`). Re-points `PurchaseInvoice` and
`SupplierPayment` `supplierId` from each source to the target in the same transaction.

---

## User

| Field | Type | Notes |
|---|---|---|
| username | string | unique |
| firstName | string | required on create |
| lastName | string | required on create |
| passwordHash | string | *(added — required for JWT auth, not itemized in source PDF)* |
| role | string enum | `super_admin` \| `admin` |
| isActive | boolean | |
| isDeleted | boolean | |
| createdAt / updatedAt | date | |

**Relationships:** creates `SalesInvoice`, `PurchaseInvoice`; records
`Payment`; adjusts `StockAdjustment`; changes `ItemPriceHistory`; performs
`AuditLog` entries; owns many `RefreshToken`.

**Rules:** only `super_admin` can create/deactivate `User` records. There is
exactly one super admin flow (seeded), not self-registerable.

---

## RefreshToken

| Field | Type | Notes |
|---|---|---|
| userId | ObjectId → User | |
| tokenHash | string | hash the raw token (e.g. SHA-256), never store plaintext |
| expiresAt | date | |
| revokedAt | date \| null | |
| createdAt | date | |

Derived at read time (not stored): `isExpired = now > expiresAt`,
`isRevoked = revokedAt != null`, `isActive = !isRevoked && !isExpired`.
**Hard-deleted** on logout, expiry cleanup, or rotation (old token removed
when a new one is issued).

---

## Category

| Field | Type | Notes |
|---|---|---|
| name | string | e.g. "ساده MDF", "خشب" |
| isActive | boolean | deactivation flag |
| isDeleted | boolean | soft delete |
| createdAt / updatedAt | date | |

**Relationships:** 1 → many `Item`.
**Indexes:** unique index on `name` scoped to non-deleted docs
(`{ name: 1 }` partial filter `{ isDeleted: false }`).

---

## Item

| Field | Type | Notes |
|---|---|---|
| code | string | |
| name | string | |
| categoryId | ObjectId → Category | |
| isWood | boolean | |
| pricingMode | string enum | `per_piece` \| `per_cubic_meter` |
| unitPrice | number | current selling price |
| cost | number | current/live cost price |
| stockQuantity | number | pieces or m³, depending on `pricingMode` |
| reorderThreshold | number | triggers low-stock alert |
| isActive | boolean | |
| isDeleted | boolean | |
| createdAt / updatedAt | date | |

**Relationships:** belongs to `Category`; referenced by
`SalesInvoiceLine`, `PurchaseInvoiceLine`; has many `ItemPriceHistory`,
`StockAdjustment`.

**Rules:** `unitPrice`/`cost` changes must append an `ItemPriceHistory`
entry, never a silent overwrite. `stockQuantity` may be set on create only;
later changes go through `StockAdjustment` (Phase 7). `code` is unique among
non-deleted items.

**Indexes:** partial unique index on `code` where `{ isDeleted: false }`;
index on `{ categoryId: 1, isDeleted: 1 }`.

---

## Setting

Shop-wide configuration values (singleton-style keys).

| Field | Type | Notes |
|---|---|---|
| key | string | unique, e.g. `baladi_wood_meter_price` |
| value | number | EGP amount for the base reference price (سعر متر الخشب البلدي) |
| createdAt / updatedAt | date | |

**Rules:** `baladi_wood_meter_price` is the system-wide base reference price
used across pricing screens. Changes are audited via `AuditLog`
(`setting_changed`).

---

## SalesInvoice

| Field | Type | Notes |
|---|---|---|
| invoiceNumber | string | unique; format `INV-NNNN` (zero-padded sequence from `InvoiceCounter`, keyed by Cairo calendar year) |
| type | string enum | `cash_sale` \| `customer_sale` |
| customerId | ObjectId → Customer \| null | null for cash sale |
| lines | SalesInvoiceLine[] | embedded; at least one required |
| total | number | subtotal before discount (server-computed) |
| discount | number | default 0; must be `0 ≤ discount ≤ total` |
| paid | number | amount collected at create; must equal net for cash; `0 ≤ paid ≤ net` for customer |
| remaining | number | `total - discount - paid` |
| status | string enum | `saved` \| `cancelled` |
| createdBy | ObjectId → User | |
| pdfShareToken | string \| null | durable public share secret (`crypto` hex, 64 chars); unique sparse index; minted lazily on first `GET .../share` |
| createdAt / updatedAt | date | |

**Relationships:** belongs to `Customer` (nullable); created by `User`;
embeds many `SalesInvoiceLine`; has many `Payment`; logged in `AuditLog`.

**Indexes:** unique `invoiceNumber`; `createdAt`; `customerId`; `status`;
unique partial on `pdfShareToken` where token is a string.

**Rules:**
- If `remaining > 0` on a `customer_sale`, add **only** `remaining` to
  `Customer.balance` (مديونية). Do **not** also subtract the on-invoice
  paid amount from balance — that would undercount debt (see `Payment`).
- Cash sales (`cash_sale`) never change `Customer.balance`; must be fully
  paid (`paid === total - discount`, no overpay/tips).
- Saving an invoice deducts `Item.stockQuantity` per line (may go negative).
  - `per_piece`: deduct `quantity`
  - `per_cubic_meter`: deduct `quantity × volume` where
    `volume = (thickness × width × length) / 1_000_000` (cm → m³, 6 dp)
- Cancelling an invoice (`status = cancelled`) reverses the stock deduction
  and reverses the `Customer.balance += remaining` that was applied at save
  time (use the invoice’s original `remaining` at save, not a replay of
  payment rows). On-invoice `Payment` rows get `reversedAt` / `reversedBy`.
- No edit after save — cancel only.
- Reject deleted or inactive items/customers on create.
- List filters: optional `status`; `period=day|week|month|year` + `date`
  (`YYYY-MM-DD`) in **Africa/Cairo** (week = Saturday–Friday); search `q`
  by invoice number or customer name/phone.
- PDF: authenticated `GET /sales-invoices/:id/pdf` and public
  `GET /public/sales-invoices/:token/pdf` (token = `pdfShareToken`).
  Share payload: `GET /sales-invoices/:id/share` → `{ pdfUrl, whatsappUrl, message }`.
  PDFs are generated on request (Arabic-primary); tokens do not expire.

---

## SalesInvoiceLine *(embedded in SalesInvoice)*

| Field | Type | Notes |
|---|---|---|
| itemId | ObjectId → Item | |
| quantity | number | must be `> 0` |
| width, length, thickness | number (cm) \| null | required and `> 0` only if `pricingMode = per_cubic_meter` |
| piecePrice | number | unit price **snapshot** at time of sale (`> 0`; cashier may override live `unitPrice`) |
| costPriceSnapshot | number | always copied from live `Item.cost` at save (not client-overridable) |
| lineTotal | number | `per_piece`: `quantity × piecePrice`; `per_cubic_meter`: `quantity × volume × piecePrice` |
| note | string \| null | optional |

---

## InvoiceCounter

Atomic sequence for sales invoice numbers.

| Field | Type | Notes |
|---|---|---|
| key | string | unique, e.g. `sales:2026` |
| seq | number | incremented with `$inc` inside the create transaction |
| createdAt / updatedAt | date | |

---

## Payment

| Field | Type | Notes |
|---|---|---|
| customerId | ObjectId → Customer \| null | |
| invoiceId | ObjectId → SalesInvoice \| null | null for standalone debt payments |
| amount | number | EGP, > 0, rounded to 2 decimals |
| method | string enum | `cash` \| `instapay` \| `vodafone_cash` \| `bank_transfer` \| `check`, default `cash` |
| notes | string \| null | optional memo / check number / transaction reference |
| recordedBy | ObjectId → User | |
| reversedAt | date \| null | set when cancelled (on invoice cancel or standalone payment cancel) |
| reversedBy | ObjectId → User \| null | who cancelled / voided the payment |
| createdAt / updatedAt | date | |

Two shapes — they do **not** affect `Customer.balance` the same way:

1. **Payment on a new sale** — `invoiceId` set (captured while creating a
   `SalesInvoice` when `paid > 0`). Updates invoice `paid` / `remaining`
   only. Does **not** change `Customer.balance` (debt was already set to
   that invoice’s `remaining` on save). Example: total 100, paid 40 →
   balance += 60 only; the Payment(40) is history, not a second balance
   mutation. On cancel, set `reversedAt` / `reversedBy` (do not delete).
2. **Standalone debt payment** — `invoiceId` null, `customerId` set. Used
   when a customer pays off part of an existing debt on a later date.
   This **does** reduce `Customer.balance` by `amount`. *(Phase 5)*

Both shapes are logged in `AuditLog`. Active payment history should treat
`reversedAt != null` as voided.

---

## SupplierPayment

| Field | Type | Notes |
|---|---|---|
| supplierId | ObjectId → Supplier | required |
| purchaseId | ObjectId → PurchaseInvoice \| null | null for standalone debt payments |
| amount | number | EGP, > 0, rounded to 2 decimals |
| method | string enum | `cash` \| `instapay` \| `vodafone_cash` \| `bank_transfer` \| `check`, default `cash` |
| notes | string \| null | optional memo / check number / transaction reference |
| recordedBy | ObjectId → User | |
| reversedAt | date \| null | set when cancelled (on purchase invoice cancel or standalone payment cancel) |
| reversedBy | ObjectId → User \| null | who cancelled / voided the payment |
| createdAt / updatedAt | date | |

Two shapes — they do **not** affect `Supplier.amountOwed` the same way:

1. **Payment on a new purchase** — `purchaseId` set (captured while creating a
   `PurchaseInvoice` when `paid > 0`). Updates purchase invoice `paid` / `remaining`
   only. Does **not** change `Supplier.amountOwed` (debt was already set to
   that purchase’s `remaining` on save). On purchase cancel, set `reversedAt` / `reversedBy` (do not delete).
2. **Standalone debt payment** — `purchaseId` null, `supplierId` set. Used
   when paying off part of an existing supplier debt on a later date.
   This **does** reduce `Supplier.amountOwed` by `amount`.

Both shapes are logged in `AuditLog` (`supplier_payment_recorded`, `supplier_payment_cancelled`). Active payment history treats `reversedAt != null` as voided.

---

## ItemPriceHistory *(immutable)*

| Field | Type | Notes |
|---|---|---|
| itemId | ObjectId → Item | |
| field | string | which field changed, e.g. `unitPrice`, `cost` |
| oldValue | mixed | |
| newValue | mixed | |
| changedBy | ObjectId → User | |
| createdAt | date | |

Never updated or deleted. This is the **source of truth** for price/cost
changes — the corresponding `AuditLog` entry for `price_changed` does not
duplicate `oldValue`/`newValue`; it stores a `refCollection`/`refId`
pointer back to the specific document here instead (see `AuditLog` below).

---

## StockAdjustment *(immutable)*

| Field | Type | Notes |
|---|---|---|
| itemId | ObjectId → Item | |
| oldQuantity | number | |
| newQuantity | number | |
| reason | string | e.g. manual جرد correction |
| adjustedBy | ObjectId → User | |
| createdAt | date | |

Never updated or deleted. This is the **source of truth** for stock
quantity changes — the corresponding `AuditLog` entry for `stock_adjusted`
does not duplicate `oldQuantity`/`newQuantity`; it stores a
`refCollection`/`refId` pointer back to the specific document here instead
(see `AuditLog` below).

---

## PurchaseInvoice

| Field | Type | Notes |
|---|---|---|
| invoiceNumber | string | unique; format `PUR-NNNN` (zero-padded sequence from `InvoiceCounter`, keyed by Cairo calendar year) |
| supplierId | ObjectId → Supplier | required |
| lines | PurchaseInvoiceLine[] | embedded; at least one required |
| total | number | server-computed subtotal |
| paid | number | amount paid at create; default 0; `0 ≤ paid ≤ total` |
| remaining | number | `total - paid`; adds to `Supplier.amountOwed` |
| status | string enum | `saved` \| `cancelled` |
| notes | string \| null | optional memo / notes |
| createdBy | ObjectId → User | |
| createdAt / updatedAt | date | |

**Relationships:** supplied by `Supplier`; created by `User`; embeds many
`PurchaseInvoiceLine`; 1 → many `SupplierPayment`.

**Indexes:** unique `invoiceNumber`; `createdAt`; `supplierId`; `status`.

**Rules:**
- Saving a purchase invoice increases `Item.stockQuantity` for each line
  and increases `Supplier.amountOwed` by `remaining`.
- `per_piece`: increments `quantity`.
- `per_cubic_meter`: increments `quantity × volume` where
  `volume = (thickness × width × length) / 1_000_000` (cm → m³, 6 dp).
- Saving a purchase invoice with `paid > 0` transactionally creates an on-purchase
  `SupplierPayment` record (`purchaseId` set, `supplierId` set).
- Cancelling a purchase invoice (`status = cancelled`) reverses the stock increment
  (deducts stock), reverses the `Supplier.amountOwed += remaining` applied at save,
  and voids any associated `SupplierPayment` records via `reversedAt` / `reversedBy`.
- `unitCost` on each line is a snapshot for that purchase and does not alter live `Item.cost`.

---

## PurchaseInvoiceLine *(embedded in PurchaseInvoice)*

| Field | Type | Notes |
|---|---|---|
| itemId | ObjectId → Item | |
| quantity | number | must be `> 0` |
| width, length, thickness | number (cm) \| null | required and `> 0` only if item `pricingMode = per_cubic_meter` |
| unitCost | number | unit cost snapshot at time of purchase (`> 0`) |
| lineTotal | number | `per_piece`: `quantity × unitCost`; `per_cubic_meter`: `quantity × volume × unitCost` |
| note | string \| null | optional |

---

## AuditLog *(immutable, read-only)*

`AuditLog` is a **unified activity feed** — who did what, to what, when —
across the whole system. It is not the storage location for every diff:
where a dedicated, structured history collection already exists for an
action (`ItemPriceHistory`, `StockAdjustment`), `AuditLog` points to that
record instead of duplicating its values, so there is exactly one source of
truth for each kind of change.

| Field | Type | Notes |
|---|---|---|
| userId | ObjectId → User | |
| action | string | e.g. `invoice_created`, `invoice_cancelled`, `payment_recorded`, `payment_cancelled`, `supplier_payment_recorded`, `supplier_payment_cancelled`, `stock_adjusted`, `purchase_created`, `purchase_cancelled`, `price_changed`, `category_created`, `category_edited`, `category_deleted`, `item_created`, `item_edited`, `item_deleted`, `setting_changed`, `customer_created`, `customer_edited`, `customer_deleted`, `customer_merged`, `supplier_created`, `supplier_edited`, `supplier_deleted`, `supplier_merged`, `admin_created` |
| entityType | string | e.g. `SalesInvoice`, `Payment`, `SupplierPayment`, `Item`, `Category`, `Setting`, `Customer`, `Supplier`, `PurchaseInvoice`, `User` |
| entityId | ObjectId | polymorphic reference to the affected record |
| changes | `Record<string, { old: mixed, new: mixed }>` \| null | *(added)* per-field diff, used only for actions **without** a dedicated history collection (`item_edited`, `customer_edited`, `supplier_edited`, `customer_merged`, `supplier_merged`, `*_deleted`, `admin_created`, `invoice_cancelled`, etc.) — keyed by field name so a single entry can capture multiple fields changing at once (e.g. a customer's `name` and `phone` edited in the same save) |
| refCollection | string \| null | *(added)* set for actions **with** a dedicated history collection, e.g. `"ItemPriceHistory"` or `"StockAdjustment"` |
| refId | ObjectId \| null | *(added)* points to the specific document in `refCollection` that holds the actual old/new values |
| summary | string \| null | *(added)* optional precomputed human-readable one-liner (e.g. `"unitPrice: 120 → 135 ج.م"`) so the audit log list view can render something useful without joining to `refCollection`/`refId` on every row |
| createdAt | date | |

**Rule of thumb when writing an entry:**
- `price_changed` → set `refCollection: "ItemPriceHistory"` + `refId`, leave `changes` null.
- `stock_adjusted` → set `refCollection: "StockAdjustment"` + `refId`, leave `changes` null.
- soft-delete → action `*_deleted` (not `*_edited`) with `isDeleted` / `isActive` in `changes`.
- everything else → set `changes` with the per-field diff, leave `refCollection`/`refId` null.

Never updated or deleted; no edit/delete endpoints exist for this
collection at all — append-only.

---

## Relationship summary

| From | To | Type |
|---|---|---|
| Customer | SalesInvoice | 1 → many |
| Customer | Payment | 1 → many |
| Supplier | PurchaseInvoice | 1 → many |
| Supplier | SupplierPayment | 1 → many |
| User | SalesInvoice / PurchaseInvoice | 1 → many (creates) |
| User | AuditLog | 1 → many (performs) |
| User | Payment / SupplierPayment | 1 → many (records) |
| User | StockAdjustment | 1 → many (adjusts) |
| User | ItemPriceHistory | 1 → many (changes) |
| User | RefreshToken | 1 → many |
| Category | Item | 1 → many |
| Item | SalesInvoiceLine / PurchaseInvoiceLine | 1 → many |
| Item | ItemPriceHistory / StockAdjustment | 1 → many |
| SalesInvoice | SalesInvoiceLine | 1 → many (embedded) |
| SalesInvoice | Payment | 1 → many |
| PurchaseInvoice | PurchaseInvoiceLine | 1 → many (embedded) |
| PurchaseInvoice | SupplierPayment | 1 → many |
| ItemPriceHistory | AuditLog | 1 → 1 (referenced via `refCollection`/`refId`) |
| StockAdjustment | AuditLog | 1 → 1 (referenced via `refCollection`/`refId`) |
| InvoiceCounter | SalesInvoice / PurchaseInvoice | supplies sequential numbers |
