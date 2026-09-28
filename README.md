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
    sales-invoices/        # invoices, PDF, public share PDF
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
- Piece pricing or per-cubic-meter pricing (dimensions in cm)
- Price and cost changes go through `/pricing` and append price history (never a silent overwrite)

### Customers (`/api/v1/customers`)

- Create, list, get, update, and soft-delete customers
- Customer balance (مديونية) is maintained by the server
- Search, filter by debt and active status, and merge duplicate customers

### Suppliers (`/api/v1/suppliers`)

- Create, list, get, update, and soft-delete suppliers
- Amount owed is maintained by the server
- Search, filter by debt and active status, and merge duplicate suppliers

### Sales invoices (`/api/v1/sales-invoices`)

- Create cash or customer invoices with line items, discount, and payment
- List and get invoices; cancel an invoice (reverses stock and the debt applied at save)
- Invoice numbers are `INV-NNNN`, sequenced by Cairo year
- Download an Arabic PDF, or a WhatsApp share payload
- Public PDF download by share token (no login)

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

- Sales, debt, and period KPIs
- Period filter: `day`, `week`, `month`, or `year`, with an optional `date`

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
- Puppeteer for invoice PDFs

Successful JSON responses use `{ success: true, data }`. PDF routes return raw `application/pdf` and are not wrapped.

## Prerequisites

- Node.js (LTS)
- MongoDB running locally or remotely

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

| Variable                    | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `MONGO_URI`                 | MongoDB connection URI                               |
| `NODE_ENV`                  | `development` or `production`                        |
| `PORT`                      | HTTP port (default `3000`)                           |
| `JWT_ACCESS_SECRET`         | Secret for signing access tokens                     |
| `JWT_REFRESH_SECRET`        | Secret for signing refresh tokens                    |
| `JWT_ACCESS_EXPIRES_IN`     | Access token lifetime (e.g. `10m`)                   |
| `JWT_REFRESH_EXPIRES_IN`    | Refresh token lifetime (e.g. `21d`)                  |
| `PUBLIC_API_BASE_URL`       | Public base URL used in PDF and WhatsApp links       |
| `THROTTLE_DISABLED`         | Set `true` to disable rate limits                    |
| `THROTTLE_AUTH_LIMIT`       | Auth requests per minute per IP (default `10`)       |
| `THROTTLE_PUBLIC_PDF_LIMIT` | Public PDF requests per minute per IP (default `20`) |
| `THROTTLE_GLOBAL_LIMIT`     | Other requests per minute per IP (default `300`)     |

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

All routes except **login**, **refresh**, **logout**, **health**, and the **public invoice PDF** require:

`Authorization: Bearer <accessToken>`

Role **Both** means `admin` and `super_admin`.

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

| Method   | Path                              | Auth | Description                           |
| -------- | --------------------------------- | ---- | ------------------------------------- |
| `POST`   | `/api/v1/items`                   | Both | Create item                           |
| `GET`    | `/api/v1/items`                   | Both | List items                            |
| `GET`    | `/api/v1/items/:id`               | Both | Get item                              |
| `GET`    | `/api/v1/items/:id/price-history` | Both | Price and cost history                |
| `PATCH`  | `/api/v1/items/:id`               | Both | Update item                           |
| `PATCH`  | `/api/v1/items/:id/pricing`       | Both | Change price or cost (writes history) |
| `DELETE` | `/api/v1/items/:id`               | Both | Soft-delete item                      |

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

| Method | Path                                       | Auth | Description               |
| ------ | ------------------------------------------ | ---- | ------------------------- |
| `POST` | `/api/v1/sales-invoices`                   | Both | Create invoice            |
| `GET`  | `/api/v1/sales-invoices`                   | Both | List invoices             |
| `GET`  | `/api/v1/sales-invoices/:id`               | Both | Get invoice               |
| `GET`  | `/api/v1/sales-invoices/:id/pdf`           | Both | Download PDF              |
| `GET`  | `/api/v1/sales-invoices/:id/share`         | Both | WhatsApp / share payload  |
| `POST` | `/api/v1/sales-invoices/:id/cancel`        | Both | Cancel invoice            |
| `GET`  | `/api/v1/public/sales-invoices/:token/pdf` | No   | Public PDF by share token |

Invoice list query params: `q`, `status`, `period`, `date`, `page`, `limit`.

`period` is `day`, `week`, `month`, or `year`. When `period` is set, `date` is `YYYY-MM-DD`.

### Payments

| Method | Path                          | Auth | Description               |
| ------ | ----------------------------- | ---- | ------------------------- |
| `POST` | `/api/v1/payments`            | Both | Record a customer payment |
| `GET`  | `/api/v1/payments`            | Both | List payments             |
| `GET`  | `/api/v1/payments/:id`        | Both | Get payment               |
| `POST` | `/api/v1/payments/:id/cancel` | Both | Cancel payment            |

Payment list query params: `customerId`, `status`, `type`, `method`, `period`, `date`, `page`, `limit`.

### Purchases

| Method | Path                           | Auth | Description             |
| ------ | ------------------------------ | ---- | ----------------------- |
| `POST` | `/api/v1/purchases`            | Both | Create purchase invoice |
| `GET`  | `/api/v1/purchases`            | Both | List purchases          |
| `GET`  | `/api/v1/purchases/:id`        | Both | Get purchase            |
| `POST` | `/api/v1/purchases/:id/cancel` | Both | Cancel purchase         |

Purchase list query params: `supplierId`, `status`, `period`, `date`, `page`, `limit`.

### Supplier payments

| Method | Path                                   | Auth | Description               |
| ------ | -------------------------------------- | ---- | ------------------------- |
| `POST` | `/api/v1/supplier-payments`            | Both | Record a supplier payment |
| `GET`  | `/api/v1/supplier-payments`            | Both | List payments             |
| `GET`  | `/api/v1/supplier-payments/:id`        | Both | Get payment               |
| `POST` | `/api/v1/supplier-payments/:id/cancel` | Both | Cancel payment            |

Supplier payment list query params: `supplierId`, `status`, `type`, `method`, `period`, `date`, `page`, `limit`.

### Inventory

| Method | Path                                | Auth | Description                |
| ------ | ----------------------------------- | ---- | -------------------------- |
| `GET`  | `/api/v1/inventory/stock`           | Both | Stock list                 |
| `GET`  | `/api/v1/inventory/valuation`       | Both | Stock valuation            |
| `POST` | `/api/v1/inventory/adjustments`     | Both | Record a manual adjustment |

Stock list query params: `categoryId`, `stockStatus`, `q`, `page`, `limit`.

A manual adjustment updates `Item.stockQuantity` and writes a `stock_adjusted` audit row. List those rows with `GET /api/v1/audit-logs`.

### Dashboard

| Method | Path                | Auth | Description |
| ------ | ------------------- | ---- | ----------- |
| `GET`  | `/api/v1/dashboard` | Both | Period KPIs |

Query params: `period`, `date`.

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

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## Seed data (development)

Requires `.env` with `MONGO_URI`. Invoice, purchase, and inventory seeds expect a user to already exist.

```bash
npm run seed:catalog      # categories, items, base reference price
npm run seed:parties      # sample customers and suppliers
npm run seed:invoices     # sample cash and customer sales invoices
npm run seed:purchases    # sample purchase invoices
npm run seed:inventory    # sample stock adjustments
```
