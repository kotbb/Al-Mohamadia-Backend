# Al-Mohamadia

NestJS backend API for a wood store (sales, inventory, customer debt, purchases, operating expenses, and audit) with MongoDB. A **super admin** creates admin accounts (users cannot self-register). Admins and the super admin then sign in, sell and restock wood, track customer balances and supplier debt, record paid expenses, adjust stock, and review an append-only audit trail.

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
    operating-expenses/    # paid expense ledger + expense categories
    inventory/             # stock, valuation, manual adjustments
    dashboard/
    audit/                 # append-only audit log
    health/
  shared/                  # guards, response envelope, pipes, enums
  scripts/                 # development seed scripts
```

## Features

### Authentication (`/api/v1/auth`)

- Login with a JWT access token and a refresh token
- Refresh rotates the refresh token (only a hash is stored)
- Logout revokes the refresh token
- No public self-registration and no email verification

### Users (`/api/v1/users`)

- List users and get the current profile
- Create, update, and soft-delete users (**super admin only**)
- Update can change name, username, password, active flag, and role (`admin` or `super_admin`)
- A super admin cannot change their own role
- Soft-delete sets `isDeleted` / `isActive`; there is no hard delete

### Categories (`/api/v1/categories`)

- Create, list, get, update, and soft-delete categories

### Items (`/api/v1/items`)

- Create, list, get, update, and soft-delete items
- Piece pricing or per-cubic-meter pricing (all dimensions in meters)
- Optional descriptive piece dimensions; cubic pricing requires thickness, width, and length
- Multiple positive dimension defaults per axis, deduplicated and sorted numerically
- Append defaults through `POST /items/:id/dimension-defaults` with transactional auditing and concurrent-write protection
- Price and cost changes go through `/pricing` and append price history (never a silent overwrite)

### Customers (`/api/v1/customers`)

- Create, list, get, update, and soft-delete customers
- Customer balance (مديونية) is maintained by the server
- Search, filter by debt and active status, and merge duplicate customers
- Optional nullable phone; omitted updates preserve it, explicit null clears it

### Suppliers (`/api/v1/suppliers`)

- Create, list, get, update, and soft-delete suppliers
- Amount owed is maintained by the server
- Search, filter by debt and active status, and merge duplicate suppliers
- Optional nullable phone; supplied numbers remain normalized and unique

### Sales invoices (`/api/v1/sales-invoices`)

- Create cash or customer invoices with line items, discount, and payment
- Update an invoice (reconciles stock, customer balance, and linked payments)
- List and get invoices; cancel an invoice (reverses stock and customer debt)
- Invoice numbers are `INV-NNNN`, sequenced by Cairo year
- Get a WhatsApp share payload with a public receipt link
- Public invoice receipt by share token (no login)
- Authenticated receipt JSON for frontend PNG A5 / PDF A4 export and same-customer previous/next navigation
- Export rendering runs in the frontend; the API does not generate PDF or PNG files
- Server-controlled pricing mode snapshots preserve piece/cubic behavior during updates and reversals; legacy lines retain fallback support

### Payments (`/api/v1/payments`)

- Record a payment on an invoice or a standalone customer debt payment
- List and get payments
- Cancel a payment (voids it; does not hard-delete)

### Purchases (`/api/v1/purchases`)

- Create a purchase invoice (increases stock and supplier debt)
- List and get purchases
- Cancel a purchase (reverses stock and supplier debt)

### Supplier payments (`/api/v1/supplier-payments`)

- Record a supplier payment
- List and get payments
- Cancel a supplier payment

### Inventory (`/api/v1/inventory`)

- Live stock list with low-stock filter and search
- Stock valuation
- Manual stock adjustments (جرد) with a reason, stored on the audit log

### Dashboard (`/api/v1/dashboard`)

- Today's sales, estimated gross profit, paid expenses, estimated net profit, collections, and invoice count
- Customer debt totals and selected-period financial summaries, chart series, and top sellers
- Period filter: `day`, `week`, `month`, or `year`; alternatively an inclusive Cairo `from`/`to` range

### Operating expenses (`/api/v1/operating-expenses`)

- Create, list, view, edit, and soft-delete paid EGP expenses
- Separate expense categories with activation/deactivation and editable names
- Filter by inclusive Cairo expense dates, category, method, and payee/notes search
- Paginated rows with totals over all active matching records, independent of page
- Expense and category mutations are audited in Mongo transactions; future payment dates are rejected
- Paid expenses reduce estimated net profit on their recorded expense dates
- Recurring schedules, due/overdue obligations, and reminder emails are planned, not implemented

### Audit log (`/api/v1/audit-logs`)

- Append-only activity feed (no update or delete)
- Filter by actor, action, entity, and date range
- List actors who appear in the log

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
| `CORS_ORIGIN`            | Comma-separated browser origins (default `http://localhost:3001`) |
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

Item list query params: `categoryId`, `isActive`.

### Customers

| Method   | Path                      | Auth | Description               |
| -------- | ------------------------- | ---- | ------------------------- |
| `POST`   | `/api/v1/customers`       | Both | Create customer           |
| `POST`   | `/api/v1/customers/merge` | Both | Merge duplicate customers |
| `GET`    | `/api/v1/customers`       | Both | List / search customers   |
| `GET`    | `/api/v1/customers/:id`   | Both | Get customer              |
| `PATCH`  | `/api/v1/customers/:id`   | Both | Update customer           |
| `DELETE` | `/api/v1/customers/:id`   | Both | Soft-delete customer      |

Customer list query params: `q`, `hasDebt`, `isActive`, `page`, `limit`.

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
| `GET`   | `/api/v1/sales-invoices/:id/neighbors` | Both | Previous/next invoice IDs for the same customer     |
| `POST`  | `/api/v1/sales-invoices/:id/cancel`    | Both | Cancel invoice                                      |
| `GET`   | `/api/v1/public/sales-invoices/:token` | No   | Public invoice receipt JSON by share token          |

Invoice list query params: `q`, `status`, `period`, `date`, `from`, `to`, `page`, `limit`.

Cash sales have no customer neighbors.

`period` is `day`, `week`, `month`, or `year`. When `period` is set, `date` is `YYYY-MM-DD`.

### Payments

| Method | Path                          | Auth | Description               |
| ------ | ----------------------------- | ---- | ------------------------- |
| `POST` | `/api/v1/payments`            | Both | Record a customer payment |
| `GET`  | `/api/v1/payments`            | Both | List payments             |
| `GET`  | `/api/v1/payments/:id`        | Both | Get payment               |
| `POST` | `/api/v1/payments/:id/cancel` | Both | Cancel payment            |

Payment list query params: `customerId`, `status`, `type`, `method`, `period`, `date`, `from`, `to`, `page`, `limit`.

### Purchases

| Method | Path                           | Auth | Description             |
| ------ | ------------------------------ | ---- | ----------------------- |
| `POST` | `/api/v1/purchases`            | Both | Create purchase invoice |
| `GET`  | `/api/v1/purchases`            | Both | List purchases          |
| `GET`  | `/api/v1/purchases/:id`        | Both | Get purchase            |
| `POST` | `/api/v1/purchases/:id/cancel` | Both | Cancel purchase         |

Purchase list query params: `supplierId`, `status`, `period`, `date`, `from`, `to`, `page`, `limit`.

### Supplier payments

| Method | Path                                   | Auth | Description               |
| ------ | -------------------------------------- | ---- | ------------------------- |
| `POST` | `/api/v1/supplier-payments`            | Both | Record a supplier payment |
| `GET`  | `/api/v1/supplier-payments`            | Both | List payments             |
| `GET`  | `/api/v1/supplier-payments/:id`        | Both | Get payment               |
| `POST` | `/api/v1/supplier-payments/:id/cancel` | Both | Cancel payment            |

Supplier payment list query params: `supplierId`, `status`, `type`, `method`, `period`, `date`, `from`, `to`, `page`, `limit`.

### Inventory

| Method | Path                            | Auth | Description                |
| ------ | ------------------------------- | ---- | -------------------------- |
| `GET`  | `/api/v1/inventory/stock`       | Both | Stock list                 |
| `GET`  | `/api/v1/inventory/valuation`   | Both | Stock valuation            |
| `POST` | `/api/v1/inventory/adjustments` | Both | Record a manual adjustment |

Stock list query params: `categoryId`, `stockStatus`, `q`, `page`, `limit`.

A manual adjustment updates `Item.stockQuantity` and writes a `stock_adjusted` audit row. List those rows with `GET /api/v1/audit-logs`.

### Dashboard

| Method | Path                | Auth | Description |
| ------ | ------------------- | ---- | ----------- |
| `GET`  | `/api/v1/dashboard` | Both | Period KPIs |

Query params: `period`, `date`, or a custom `from`/`to` pair.

### Operating expenses

| Method   | Path                                        | Auth | Description                                |
| -------- | ------------------------------------------- | ---- | ------------------------------------------ |
| `GET`    | `/api/v1/operating-expenses`                | Both | Paginated paid ledger and filtered summary |
| `POST`   | `/api/v1/operating-expenses`                | Both | Record a paid expense                      |
| `GET`    | `/api/v1/operating-expenses/:id`            | Both | Expense details                            |
| `PATCH`  | `/api/v1/operating-expenses/:id`            | Both | Edit a non-deleted expense                 |
| `DELETE` | `/api/v1/operating-expenses/:id`            | Both | Terminal soft delete                       |
| `GET`    | `/api/v1/operating-expenses/categories`     | Both | List expense categories                    |
| `POST`   | `/api/v1/operating-expenses/categories`     | Both | Create a category                          |
| `PATCH`  | `/api/v1/operating-expenses/categories/:id` | Both | Rename or activate/deactivate              |

Expense query params: `from`, `to`, `categoryId`, `method`, `search`, `page`, `limit`.

### Audit log

| Method | Path                        | Auth | Description        |
| ------ | --------------------------- | ---- | ------------------ |
| `GET`  | `/api/v1/audit-logs`        | Both | List audit entries |
| `GET`  | `/api/v1/audit-logs/actors` | Both | List actors        |

Audit list query params: `userId`, `action`, `entityType`, `entityId`, `from`, `to`, `page`, `limit`.

`from` and `to` are `YYYY-MM-DD`.

### Health

| Method | Path             | Auth | Description  |
| ------ | ---------------- | ---- | ------------ |
| `GET`  | `/api/v1/health` | No   | Health check |

## Roles

| Role        | Value         | Notes                                                                                                      |
| ----------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Admin       | `admin`       | Shop operations: catalog, invoices, payments, purchases, inventory, dashboard, audit. Cannot manage users. |
| Super admin | `super_admin` | Everything an admin can do, plus create, update, and soft-delete users. Cannot change their own role.      |

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

`npm run build` runs architecture validation before compilation. For read-only
linting use `npx eslint "{src,test}/**/*.ts"`; `npm run lint` auto-fixes files.

## Seed data (development)

Requires `.env` with `MONGO_URI`. Invoice, purchase, and inventory seeds expect a user to already exist.

```bash
npm run seed:catalog      # categories and sample items with meter defaults
npm run seed:parties      # sample customers and suppliers
npm run seed:invoices     # sample cash and customer sales invoices
npm run seed:purchases    # sample purchase invoices
npm run seed:inventory    # sample stock adjustments
npm run seed:expenses     # starter expense categories; preserves existing edits
```

Use mock catalog/party/invoice/purchase/inventory seeds only against an intended
development database. No seeds or migrations run automatically at application startup.
Existing customer databases may retain the older phone index; the updated schema
defines the nullable-phone index for fresh databases without rewriting records.

## Contributor documentation

- [AGENTS.md](AGENTS.md): complete repository instructions and architecture rules
- [Overview](docs/OVERVIEW.md): setup, capabilities, and runtime notes
- [Database](docs/DATABASE.md): schemas, indexes, API invariants, and legacy behavior
- [Phases](docs/PHASES.md): implemented work, pending manual checks, and planned recurrence

`npm run build` runs architecture validation before compilation. For read-only
linting use `npx eslint "{src,test}/**/*.ts"`; `npm run lint` auto-fixes files.
