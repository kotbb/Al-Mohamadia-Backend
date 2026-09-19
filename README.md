# Al-Mohamadia Backend

NestJS API for **Al-Mohamadia**, a wood store management system. Handles
authentication, sales invoicing, inventory, customers, suppliers, purchases,
dashboard aggregations, and an append-only audit trail.

The Next.js admin UI talks **only** to this API. MongoDB is the source of
truth for stock, balances, invoices, and history.

| | |
|---|---|
| **Stack** | NestJS · MongoDB (Mongoose) · JWT |
| **Currency** | EGP (ج.م) |
| **API prefix** | `/api/v1` |
| **Default port** | `3000` |

---

## Features

- **Auth & users** — login, refresh, logout; `super_admin` manages admins *(Phase 1)*
- **Catalog & pricing** — categories, items, price history, base reference price *(Phase 2)*
- **Customers & suppliers** — balances (مديونية) and amounts owed, search, merge duplicates *(Phase 3)*
- **Sales invoicing** — cash / customer invoices, line items, cancel, Arabic PDF & WhatsApp share *(Phase 4)*
- **Payments** — on-invoice and standalone customer debt payments with cancellation *(Phase 5)*
- **Purchases & restock** — purchase invoices from suppliers and supplier payments *(Phase 6)*
- **Inventory management** — live stock, low-stock alerts, manual audit adjustments (جرد), valuation *(Phase 7)*
- **Dashboard & audit** — daily KPIs and tamper-evident activity feed *(planned)*

---

## Getting started

### Prerequisites

- Node.js (LTS recommended)
- MongoDB (local or Atlas)

### Setup

```bash
npm install
cp .env.example .env
```

Fill in secrets in `.env` (never commit real credentials). See
[`.env.example`](./.env.example) for the full list (`MONGO_URI`, `PORT`, JWT
secrets, etc.).

### Run

```bash
# development
npm run start:dev

# production
npm run build
npm run start:prod
```

API: `http://localhost:3000/api/v1`

### Tests

```bash
npm run test
npm run test:e2e
npm run test:cov
```

### Seed data (development)

```bash
npm run seed:super-admin   # first super_admin account
npm run seed:catalog       # categories, items, base reference price
npm run seed:parties       # sample customers and suppliers
npm run seed:invoices      # sample cash & customer sales invoices
```

Requires `.env` with `MONGO_URI`. See [`.env.example`](./.env.example).

---

## Related repository

| Repo | Role |
|------|------|
| [Al-Mohamadia-Frontend](../Al-Mohamadia-Frontend) | Next.js shop console (Arabic / English, light / dark) |

If the frontend also uses port `3000`, run Next on another port (e.g. `3001`).

---

## Documentation

Detailed product rules, schema, and phase plan live under `docs/` (local /
private working docs):

| Doc | Contents |
|-----|----------|
| `docs/OVERVIEW.md` | Domains, business rules, API conventions |
| `docs/AGENTS.md` | Engineering standards for contributors / AI agents |
| `docs/DATABASE.md` | MongoDB schema |
| `docs/PHASES.md` | Vertical-slice build plan |
