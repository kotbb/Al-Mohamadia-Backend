# Al-Mohamadia

NestJS backend API for a wood store (sales, inventory, customer debt, purchases, and audit) with MongoDB. A **super admin** creates admin accounts (users cannot self-register). Admins and the super admin then sign in, sell and restock wood, track customer balances and supplier debt, adjust stock, and review an append-only audit trail.

The [Al-Mohamadia frontend](https://github.com/kotbb/Al-Mohamadia-Frontend) talks only to this API under `/api/v1`.

## Project structure

```text
src/
  main.ts                  # prefix /api/v1, validation, helmet, CORS
  modules/
    auth/                  # login, refresh, logout
    users/                 # super-admin user management
    categories/
    items/                 # items + price history
    customers/
    suppliers/
    sales-invoices/        # invoices, public receipt, WhatsApp share
    payments/
    purchases/
    supplier-payments/
    inventory/             # stock, valuation, manual adjustments
    dashboard/
    audit/                 # append-only audit log
    health/
  shared/                  # guards, response envelope, pipes, enums
  scripts/                 # development seed scripts
```

Each feature separates incoming DTOs into `dto/request/` and returned contracts
into `dto/response/`; internal types and pure helpers remain in `types/` and `utils/`.

## Features

### Authentication (`/api/v1/auth`)

- Login with a JWT access token and a refresh token
- Refresh rotates the refresh token (only a hash is stored)
- Logout revokes the refresh token
- No public self-registration and no email verification

### Users (`/api/v1/users`)

- List users and get the current details of them
- Create, update, and soft-delete users (**super admin only**)
- Update can change name, username, password, active flag, and role (`admin` or `super_admin`)
- A super admin cannot change their own role
- Soft-delete sets `isDeleted` / `isActive`; there is no hard delete

### Categories (`/api/v1/categories`)

- Create, list, get, update, and soft-delete categories

### Items (`/api/v1/items`)

- Create, list, get, update, and soft-delete items
- Piece, per-cubic-meter, or `free_amount` (مبلغ حر) pricing; pricing mode is fixed at item creation
- Optional descriptive piece dimensions; cubic pricing requires thickness, width, and length
- Multiple positive dimension defaults per axis, deduplicated and sorted numerically
- Append defaults through `POST /items/:id/dimension-defaults` with transactional auditing and concurrent-write protection
- Price and cost changes go through `/pricing` and append price history (never a silent overwrite)

### Customers (`/api/v1/customers`)

- Create, list, get, update, and soft-delete customers
- Optional starting balance and editable signed current balance (debt or credit), with transactional adjustment auditing
- Search by customer name only, filter by debt and active status, and merge duplicates
- Detail financial summary: lifetime net invoiced total and active payments alongside current balance
- Optional Egyptian mobile phone (local/+20); omitted updates preserve it, explicit null clears it

### Suppliers (`/api/v1/suppliers`)

- Create, list, get, update, and soft-delete suppliers
- Optional starting amount and editable signed current amount owed, with transactional adjustment auditing
- Search by supplier name/phone, filter by debt and active status, and merge duplicates
- Detail financial summary: lifetime purchases and active payments alongside current amount owed
- Optional Egyptian mobile phone (local/+20); supplied numbers remain normalized and unique

### Sales invoices (`/api/v1/sales-invoices`)

- Create cash or customer invoices with line items, discount, and payment
- Update an invoice (reconciles stock, customer balance, and linked payments)
- List and get invoices; cancel an invoice (reverses stock and customer debt)
- Invoice numbers are `INV-NNNN`, sequenced by Cairo year
- Get a WhatsApp share payload with a public receipt link
- Public invoice receipt by share token (no login)
- Authenticated receipt JSON for frontend PNG A5 / PDF A4 export, with numeric and same-customer previous/next navigation
- Export rendering runs in the frontend; the API does not generate PDF or PNG files
- Server-controlled pricing mode snapshots preserve piece/cubic/free-amount behavior during updates and reversals; legacy lines retain fallback support
- Free-amount sales and purchase lines take an independently entered positive EGP amount and optional note, with no stock movement or catalog cost/price
- Public/private receipt lines include resolved `pricingModeSnapshot`; clients display cubic volume × saved rate as price per piece without changing stored rates/totals

### Payments (`/api/v1/payments`)

- Record standalone customer payments at any balance, including advance credit; invoice-linked payments are captured through invoice create/edit
- List and get payments
- Cancel a payment (voids it; does not hard-delete)

### Purchases (`/api/v1/purchases`)

- Create and edit purchase invoices with transactional stock, supplier debt, and linked-payment reconciliation
- List and get purchases
- Cancel a purchase (reverses stock and supplier debt)

### Supplier payments (`/api/v1/supplier-payments`)

- Record standalone supplier payments at any balance, including advance credit
- List and get payments
- Cancel a supplier payment

### Inventory (`/api/v1/inventory`)

- Live stock list with low-stock filter and search
- Stock valuation
- Manual stock adjustments (جرد) with a reason, stored on the audit log

### Dashboard (`/api/v1/dashboard`)

- Today's sales, estimated gross profit, collections, and invoice count
- Gross profit deducts stocked-item sales costs and saved free-amount purchase totals from net sales, using each invoice's creation period; supplier payments do not deduct costs again
- Customer debt totals and selected-period financial summaries, chart series, and top sellers
- Period filter: `day`, `week`, `month`, or `year`; alternatively an inclusive Cairo `from`/`to` range

### Audit log (`/api/v1/audit-logs`)

- Append-only activity feed (no update or delete)
- Filter by actor, action, entity, and date range
- List actors who appear in the log

### Personal ledger (`/api/v1/personal-ledger`)

- Shared superadmin-only people, deposits and withdrawals, independent of store accounts and KPIs.
- Optional payment method/notes, Cairo dates, filtered totals and lifetime contact balances.
- Add/rename people; edit and soft-delete movements without personal history.

### Health (`/api/v1/health`)

- Public health check

## Stack

- NestJS 11 + Express
- MongoDB + Mongoose
- JWT access and refresh tokens (refresh tokens stored as hashes)
- Passwords hashed with argon2id
- Helmet, CORS, Throttler (rate limiting)
- class-validator / class-transformer
- Client-side PDF generation on frontend

Successful JSON responses use `{ success: true, data }`.

## Prerequisites

- Node.js (LTS)
- MongoDB replica set or Atlas deployment supporting transactions

An existing super-admin account is required for initial access. This checkout has no
`seed:super-admin` command or public registration endpoint; account provisioning
must be arranged separately.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file:

```bash
cp .env.example .env
```

On Windows:

```cmd
copy .env.example .env
```

3. Edit `.env` with your values (see table below). Never commit real credentials.

### Environment variables

| Variable                 | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `MONGO_URI`              | MongoDB connection URI                                            |
| `NODE_ENV`               | `development` or `production`                                     |
| `PORT`                   | HTTP port (default `3000`)                                        |
| `JWT_ACCESS_SECRET`      | Secret for signing access tokens                                  |
| `JWT_REFRESH_SECRET`     | Secret for signing refresh tokens                                 |
| `JWT_ACCESS_EXPIRES_IN`  | Access token lifetime (e.g. `10m`)                                |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime (e.g. `21d`)                               |
| `FRONTEND_URL`           | Base URL of frontend for public WhatsApp receipts                 |
| `CORS_ORIGIN`            | Single allowed browser origin (default `http://localhost:3001`; comma-separated lists are not parsed) |
| `THROTTLE_DISABLED`      | Set `true` to disable rate limits                                 |
| `THROTTLE_AUTH_LIMIT`    | Auth requests per minute per IP (default `10`)                    |
| `THROTTLE_GLOBAL_LIMIT`  | Other requests per minute per IP (default `300`)                  |

CORS allows `http://localhost:3001` (the frontend). If the frontend also uses port `3000`, run Next on another port.

## Running the application

### Development

```bash
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

Default URL: [http://localhost:3000/api/v1](http://localhost:3000/api/v1)

## API map

All routes except **login**, **refresh**, **logout**, **health**, and the **public invoice receipt** require:

`Authorization: Bearer <accessToken>`

Role **Both** means `admin` and `super_admin`.

Sales invoices, purchases, customer payments, supplier payments, and dashboard
accept `from` and `to` together as an alternative to `period`/`date`. Dates are
inclusive Cairo calendar dates (`YYYY-MM-DD`); conflicting or invalid filters are rejected.

### Auth

| Method | Path                   | Auth | Description                                          |
| ------ | ---------------------- | ---- | ---------------------------------------------------- |
| `POST` | `/api/v1/auth/login`   | No   | Login; returns access token, refresh token, and user |
| `POST` | `/api/v1/auth/refresh` | No   | Rotate refresh token; returns a new pair             |
| `POST` | `/api/v1/auth/logout`  | No   | Revoke the refresh token                             |

### Users

| Method   | Path                | Auth        | Description                 |
| -------- | ------------------- | ----------- | --------------------------- |
| `POST`   | `/api/v1/users`     | Super admin | Create an admin             |
| `GET`    | `/api/v1/users`     | Super admin | List users                  |
| `GET`    | `/api/v1/users/me`  | Both        | Current user                |
| `PATCH`  | `/api/v1/users/:id` | Super admin | Update user, including role |
| `DELETE` | `/api/v1/users/:id` | Super admin | Soft-delete user            |

### Categories

| Method   | Path                     | Auth | Description          |
| -------- | ------------------------ | ---- | -------------------- |
| `POST`   | `/api/v1/categories`     | Both | Create category      |
| `GET`    | `/api/v1/categories`     | Both | List categories      |
| `GET`    | `/api/v1/categories/:id` | Both | Get category         |
| `PATCH`  | `/api/v1/categories/:id` | Both | Update category      |
| `DELETE` | `/api/v1/categories/:id` | Both | Soft-delete category |

### Items

| Method   | Path                                   | Auth | Description                             |
| -------- | -------------------------------------- | ---- | --------------------------------------- |
| `POST`   | `/api/v1/items`                        | Both | Create item                             |
| `GET`    | `/api/v1/items`                        | Both | List items                              |
| `GET`    | `/api/v1/items/:id`                    | Both | Get item                                |
| `GET`    | `/api/v1/items/:id/price-history`      | Both | Price and cost history                  |
| `PATCH`  | `/api/v1/items/:id`                    | Both | Update item                             |
| `PATCH`  | `/api/v1/items/:id/pricing`            | Both | Change price or cost (writes history)   |
| `POST`   | `/api/v1/items/:id/dimension-defaults` | Both | Append one normalized dimension default |
| `DELETE` | `/api/v1/items/:id`                    | Both | Soft-delete item                        |

Item list query params: `categoryId`, `isActive`. Embedded item `category` includes `createdAt` so invoice pickers order category groups oldest first without another request. Items remain alphabetical within each group. `GET /categories` returns categories by `createdAt` ascending, then `_id` for ties.

### Customers

List summaries include `debtorCount` (matching customers with positive balances) alongside `totalDebt`, so rows and KPIs require one request. `GET /categories?includeItemCount=true` returns each category's non-deleted item count, including inactive/free-amount items; ordinary category requests skip that aggregation.

| Method   | Path                      | Auth | Description               |
| -------- | ------------------------- | ---- | ------------------------- |
| `POST`   | `/api/v1/customers`       | Both | Create customer           |
| `POST`   | `/api/v1/customers/merge` | Both | Merge duplicate customers |
| `GET`    | `/api/v1/customers`       | Both | List / search customers   |
| `GET`    | `/api/v1/customers/:id`   | Both | Get customer              |
| `PATCH`  | `/api/v1/customers/:id`   | Both | Update customer           |
| `DELETE` | `/api/v1/customers/:id`   | Both | Soft-delete customer      |

Customer list query params: `q` (customer name only), `hasDebt`, `isActive`, `page`, `limit`.

### Suppliers

| Method   | Path                      | Auth | Description               |
| -------- | ------------------------- | ---- | ------------------------- |
| `POST`   | `/api/v1/suppliers`       | Both | Create supplier           |
| `POST`   | `/api/v1/suppliers/merge` | Both | Merge duplicate suppliers |
| `GET`    | `/api/v1/suppliers`       | Both | List / search suppliers   |
| `GET`    | `/api/v1/suppliers/:id`   | Both | Get supplier              |
| `PATCH`  | `/api/v1/suppliers/:id`   | Both | Update supplier           |
| `DELETE` | `/api/v1/suppliers/:id`   | Both | Soft-delete supplier      |

Supplier list query params: `q`, `hasDebt`, `isActive`, `page`, `limit`.

### Sales invoices

| Method  | Path                                   | Auth | Description                                         |
| ------- | -------------------------------------- | ---- | --------------------------------------------------- |
| `POST`  | `/api/v1/sales-invoices`               | Both | Create invoice                                      |
| `GET`   | `/api/v1/sales-invoices`               | Both | List invoices                                       |
| `GET`   | `/api/v1/sales-invoices/:id`           | Both | Get invoice                                         |
| `PATCH` | `/api/v1/sales-invoices/:id`           | Both | Update invoice (reconciles stock, balance, payment) |
| `GET`   | `/api/v1/sales-invoices/:id/share`     | Both | WhatsApp / share payload                            |
| `GET`   | `/api/v1/sales-invoices/:id/receipt`   | Both | Self-contained receipt data for export              |
| `GET`   | `/api/v1/sales-invoices/:id/neighbors` | Both | Customer and invoice-number navigation IDs     |
| `POST`  | `/api/v1/sales-invoices/:id/cancel`    | Both | Cancel invoice                                      |
| `GET`   | `/api/v1/public/sales-invoices/:token` | No   | Public invoice receipt JSON by share token          |

Invoice list query params: `q` (invoice number or customer name/phone), `customerId`, `status`, `period`, `date`, `from`, `to`, `page`, `limit`.

Neighbor responses retain `previousId`/`nextId` for customer chronology and add
`previousByNumberId`/`nextByNumberId` across numeric invoice order. Cash sales have
no customer neighbors but support numeric navigation. Numeric order includes cancelled
invoices, skips gaps and returns null at boundaries.

`period` is `day`, `week`, `month`, or `year`. When `period` is set, `date` is `YYYY-MM-DD`.

### Payments

| Method | Path                          | Auth | Description               |
| ------ | ----------------------------- | ---- | ------------------------- |
| `POST` | `/api/v1/payments`            | Both | Record a customer payment |
| `GET`  | `/api/v1/payments`            | Both | List payments             |
| `GET`  | `/api/v1/payments/:id`        | Both | Get payment               |
| `POST` | `/api/v1/payments/:id/cancel` | Both | Cancel payment            |

Payment list query params: `customerId`, `invoiceId`, `status`, `type`, `method`, `period`, `date`, `from`, `to`, `page`, `limit`.

Payment-list rows include nullable `customerName`; supplier-payment and purchase-list rows include nullable `supplierName`. Each list resolves only its page's distinct accounts with a projected batch lookup.

Standalone payment cancellation supports retained soft-deleted customers and suppliers. Payment reversal, balance restoration and audit are atomic; cancellation never reactivates an account, even if its balance becomes nonzero. Missing accounts, repeated cancellation and direct invoice-linked payment cancellation remain rejected.

### Purchases

| Method | Path                           | Auth | Description             |
| ------ | ------------------------------ | ---- | ----------------------- |
| `POST` | `/api/v1/purchases`            | Both | Create purchase invoice |
| `GET`  | `/api/v1/purchases`            | Both | List purchases          |
| `GET`  | `/api/v1/purchases/:id`        | Both | Get purchase            |
| `PATCH`| `/api/v1/purchases/:id`        | Both | Edit saved purchase     |
| `POST` | `/api/v1/purchases/:id/cancel` | Both | Cancel purchase         |

Purchase list query params: `q`, `supplierId`, `status`, `period`, `date`, `from`, `to`, `page`, `limit`.

Authenticated `GET /sales-invoices/:id` and `GET /purchases/:id` add `customer`/`supplier` (a basic account DTO or null) and `items` (only unique referenced, non-deleted items, including inactive items). These serve details/edit hydration without full-catalog or per-item requests or account financial-summary queries. List and mutation contracts remain separate; public receipts retain their historical-name behavior. Deploy the additive backend responses before the updated frontend.

### Supplier payments

| Method | Path                                   | Auth | Description               |
| ------ | -------------------------------------- | ---- | ------------------------- |
| `POST` | `/api/v1/supplier-payments`            | Both | Record a supplier payment |
| `GET`  | `/api/v1/supplier-payments`            | Both | List payments             |
| `GET`  | `/api/v1/supplier-payments/:id`        | Both | Get payment               |
| `POST` | `/api/v1/supplier-payments/:id/cancel` | Both | Cancel payment            |

Supplier payment list query params: `supplierId`, `purchaseInvoiceId`, `status`, `type`, `method`, `period`, `date`, `from`, `to`, `page`, `limit`.

### Inventory

| Method | Path                            | Auth | Description                |
| ------ | ------------------------------- | ---- | -------------------------- |
| `GET`  | `/api/v1/inventory/stock`       | Both | Stock list                 |
| `GET`  | `/api/v1/inventory/valuation`   | Both | Stock valuation            |
| `POST` | `/api/v1/inventory/adjustments` | Both | Record a manual adjustment |

Stock list query params: `categoryId`, `stockStatus`, `q`, `page`, `limit`, `paginationMode` (`items` by default, or `categories`). Category mode defaults to five complete matching categories per page, ordered by category `createdAt` ascending, then ID for ties; `limit` counts categories rather than items. Its metadata adds `paginationMode: "categories"`, `totalItems`, and `totalPages`; `meta.total` counts matching categories. Search/status filters apply before pagination, while KPI summaries retain their existing base-filter semantics. A large category is never split. Legacy item pagination keeps its existing response metadata.

A manual adjustment updates `Item.stockQuantity` and writes a `stock_adjusted` audit row. List those rows with `GET /api/v1/audit-logs`.

### Dashboard

| Method | Path                | Auth | Description |
| ------ | ------------------- | ---- | ----------- |
| `GET`  | `/api/v1/dashboard` | Both | Period KPIs |

Query params: `period`, `date`, or a custom `from`/`to` pair.

### Audit log

| Method | Path                        | Auth | Description        |
| ------ | --------------------------- | ---- | ------------------ |
| `GET`  | `/api/v1/audit-logs`        | Both | List audit entries |
| `GET`  | `/api/v1/audit-logs/actors` | Both | List actors        |

Audit list query params: `userId`, `action`, `entityType`, `entityId`, `from`, `to`, `page`, `limit`.

`from` and `to` are `YYYY-MM-DD`.

### Personal ledger

All routes require `super_admin`; every superadmin can manage all records.
Responses use the existing `{ success: true, data }` envelope.

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/api/v1/personal-ledger/contacts` | Super admin | Search/paginate people |
| `POST` | `/api/v1/personal-ledger/contacts` | Super admin | Create person or link active customer |
| `GET` | `/api/v1/personal-ledger/contacts/:id` | Super admin | Person with lifetime summary |
| `PATCH` | `/api/v1/personal-ledger/contacts/:id` | Super admin | Rename person (existing active-state field remains supported) |
| `GET` | `/api/v1/personal-ledger/movements` | Super admin | Filtered ledger with full-filter summary |
| `POST` | `/api/v1/personal-ledger/movements` | Super admin | Record deposit/withdrawal |
| `GET` | `/api/v1/personal-ledger/movements/:id` | Super admin | Movement detail |
| `PATCH` | `/api/v1/personal-ledger/movements/:id` | Super admin | Edit movement |
| `DELETE` | `/api/v1/personal-ledger/movements/:id` | Super admin | Terminal soft deletion |

Contact query: `q`, `includeInactive`, `page`, `limit`; active contacts by default.
Creation accepts exactly one of `name` or `customerId`. PATCH accepts `name`/`isActive`.
Movement query: inclusive Cairo `from`/`to`, `q`, `contactId`, `page`, `limit`.
Lists return `{ items, meta: { page, limit, total } }`; movement lists add
`summary: { deposits, withdrawals, net, count }` across all matches before pagination.
Movements sort by movement date, creation time and ID descending.

Movement bodies use `contactId`, `type` (`deposit`/`withdrawal`), positive finite
two-decimal EGP `amount`, past/today Cairo `movementDate` (`YYYY-MM-DD`), optional
`method` and `notes`. Omitted method/notes persist as null; PATCH omission preserves
values and explicit null clears them. The UI renders absent methods blank.
There is no opening-balance entry or store-account effect. See
[DATABASE.md](docs/DATABASE.md#personalledgermovement) for persistence rules.

### Health

| Method | Path             | Auth | Description  |
| ------ | ---------------- | ---- | ------------ |
| `GET`  | `/api/v1/health` | No   | Health check |

## Roles

| Role        | Value         | Notes                                                                                                      |
| ----------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Admin       | `admin`       | Shop operations: catalog, invoices, payments, purchases, inventory, dashboard, audit. Cannot manage users. |
| Super admin | `super_admin` | Everything an admin can do, plus manage the shared personal ledger and create, update, and soft-delete users. Cannot change their own role.      |

## Testing

```bash
# Unit tests
npm run test

# Architecture placement and checker fixtures
npm run check:architecture
npm run test:architecture

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

E2E tests create temporary MongoDB replica sets through `mongodb-memory-server`; they do not use the configured application database. The MongoDB test binary must be available (or downloadable on first use).

`npm run build` runs architecture validation before compilation. For read-only
linting use `npx eslint "{src,test}/**/*.ts"`; `npm run lint` auto-fixes files.

## Seed data (development)

The former catalog, party, invoice, purchase and inventory seed scripts have been removed; no seed commands are shipped. Create development examples through the application/API. Initial user provisioning is arranged separately; no public registration endpoint is available.

No seeds or migrations run automatically at application startup. Transactional tests create isolated temporary MongoDB replica sets and do not use the configured application database.

### Item identification

Items use database IDs for references and names/categories for display. Item codes are no longer generated, accepted by item create/update requests, or included in item, inventory or dashboard top-selling responses. Items and Inventory search by name; invoice selectors also match category names. Duplicate item names remain allowed.

Existing code fields and indexes require [manual cleanup](docs/REMOVE-ITEM-CODES.md); application startup does not remove them.
