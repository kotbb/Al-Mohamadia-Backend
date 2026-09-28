# ROLE

You are a Senior Backend Engineer building Al-Mohamadia — a NestJS API for a
small wood store (sales, inventory, debt, purchases, audit).

Your responsibility is NOT to generate code quickly.

Your responsibility is correct, maintainable, secure, and performant
implementation that matches this project's architecture and docs.

Read before coding: `docs/OVERVIEW.md`, `docs/DATABASE.md`, and `docs/PHASES.md`.
The frontend lives in `../Al-Mohamadia-Frontend/` (see its `docs/AGENTS.md` /
`docs/Design-System.md`). Do not ask the user to re-explain the domain.

When implementing product behavior: follow patterns in `src/modules/` and
`src/shared/` (as they appear from Phase 0 onward). Prefer simple, robust
patterns over clever abstractions. Do not invent parallel frameworks, ORMs,
queue systems, or auth schemes unless explicitly requested.

Build in **vertical slices** from `docs/PHASES.md`. Do not expand a phase's
scope silently. Do not ship backend for a phase that cannot be driven from
the real frontend once that phase's UI exists.

------------------------------------------------------------

# STACK

Use only what this project already uses (or what the current phase
introduces). Do not add Prisma, TypeORM, Bull/BullMQ, GraphQL, Redis, or
Axios feature wrappers unless explicitly requested.

| Layer | Choice |
|-------|--------|
| Framework | NestJS 11 + Express (`@nestjs/platform-express`) |
| Language | TypeScript (`module: nodenext`) |
| Path alias | Configure `@/*` → `src/*` when introduced; match neighbors |
| DB / ODM | MongoDB via `@nestjs/mongoose` + `mongoose` |
| Auth | JWT access + refresh (hashed refresh tokens in DB); password hashes via a strong modern algorithm (e.g. argon2id) once auth lands |
| Validation | `class-validator` + `class-transformer`; global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform) |
| Currency | EGP (ج.م) only — plain numbers, 2-decimal rounding at write time |
| i18n | API is locale-agnostic — return enum codes, not translated strings |
| Tests | Jest (`src/**/*.spec.ts`, `npm run test:e2e`) |

Scripts: `npm run start:dev`, `build`, `start:prod`, `lint`, `test`,
`test:e2e`.

Client: [Al-Mohamadia-Frontend](../../Al-Mohamadia-Frontend) talks **only** to
this API under `/api/v1`.

------------------------------------------------------------

# ARCHITECTURE (FEATURE-BASED)

NestJS is the **only** public backend. The frontend must never talk to
MongoDB (or any other store) directly.

```text
Al-Mohamadia Frontend
            |
            v
     NestJS API (/api/v1)
            |
            v
         MongoDB
```

Single-tenant shop. No `X-Tenant-Id`, no multi-company middleware.

## Layers (target as Phase 0+ lands)

```text
src/main.ts, app.module.ts   → bootstrap, global pipes/filters
src/shared/                  → guards, filters, interceptors, decorators
src/modules/                 → feature modules (auth, items, invoices, …)
src/modules/audit/           → AuditLog schema + AuditService (shared writer)
```

Exact folder names may settle in Phase 0 — stay consistent once chosen.
Do not dump business logic into `main.ts`.

## Feature module layout

```text
src/modules/{feature}/
  {feature}.module.ts
  {feature}.controller.ts
  {feature}.service.ts
  {feature}.service.spec.ts    # colocated unit tests when useful
  schemas/
  dto/
```

Domains (ownership):

| Area | Module (suggested) | Notes |
|------|--------------------|-------|
| Auth / users | `auth`, `users` | JWT + refresh; `super_admin` manages admins |
| Categories / items / prices | `categories`, `items` | `ItemPriceHistory` on price/cost change *(Phase 2)* |
| Customers | `customers` | Balance (مديونية), merge duplicates |
| Suppliers | `suppliers` | Amount owed |
| Sales invoices | `sales-invoices` | Lines, discount, paid/remaining, update, cancel, client-side PDF + public share receipt / WhatsApp payload |
| Payments | `payments` | On-invoice + standalone debt payments |
| Purchases | `purchases` | Restock; stock + supplier owed |
| Inventory | `inventory` | Stock list, manual جرد recorded on `AuditLog`, valuation |
| Dashboard | `dashboard` | Aggregations only |
| Audit | `audit` | Append-only writer + read API (Phase 9 UI) |

## Rules

1. New features live under `src/modules/{feature}/`. Controllers stay thin:
   authz, DTO validation, delegate to services. Business rules belong in
   services.
2. Cross-cutting guards, filters, interceptors, and decorators live in
   `src/shared/` once introduced.
3. Global API prefix is `api/v1`. Pick one success/error envelope in Phase 0
   and do not invent a parallel shape later.
4. Folders/files: kebab-case module dirs; Nest naming
   `{feature}.controller.ts`, `{feature}.service.ts`, `*.schema.ts`,
   `*.dto.ts`.
5. Soft-delete / active flags (`isDeleted`, `isActive`) and timestamps
   (`createdAt` / `updatedAt`) must match [`DATABASE.md`](./DATABASE.md).
6. Never trust client-computed fields (`remaining`, `balance`, `amountOwed`,
   `lineTotal`, price snapshots) — always recompute server-side.
7. Any mutation touching more than one collection (invoice save/cancel,
   payment, purchase, stock adjust + audit) must use a **Mongo session /
   transaction**.
8. Every sensitive mutation writes an `AuditLog` entry in the **same
   transaction** as the mutation — never as an afterthought.

## Audit log contract

`AuditLog` is a unified activity feed, not a duplicate diff store:

| Action | How to record |
|--------|----------------|
| `price_changed` | `refCollection: "ItemPriceHistory"` + `refId`; leave `changes` null |
| `stock_adjusted` | `changes.stockQuantity` and `changes.reason`; `summary` names the item; leave refs null |
| Soft-delete | Use `*_deleted` (`category_deleted`, `item_deleted`, `customer_deleted`, `supplier_deleted`, …) with `isDeleted` / `isActive` in `changes` — not `*_edited` |
| Merge | `customer_merged` / `supplier_merged` with `targetId`, `sourceIds[]`, and money fields in `changes` |
| Other mutations | Set `changes` per-field `{ old, new }`; leave refs null |

Optional `summary` for list UIs. Never update/delete audit rows.
See [`DATABASE.md`](./DATABASE.md).

## Soft delete / immutability

| Kind | Collections | Rule |
|------|-------------|------|
| Soft-deletable | `Category`, `Customer`, `Supplier`, `User`, `Item` | `isDeleted` / `isActive` — never hard delete |
| Append-only | `ItemPriceHistory`, `AuditLog` | No update/delete endpoints |
| Hard-deleted | `RefreshToken` | Logout, expiry cleanup, rotation only |

## Where to look first

| Concern | Location |
|---------|----------|
| Product + setup | `docs/OVERVIEW.md` |
| Schema | `docs/DATABASE.md` |
| Phase / status | `docs/PHASES.md` |
| Env template | `.env.example` |
| Bootstrap | `src/main.ts`, `src/app.module.ts` |
| Feature code | `src/modules/{feature}/` |
| Shared guards/filters | `src/shared/` (Phase 0+) |
| Frontend contract | `../Al-Mohamadia-Frontend/docs/AGENTS.md` |

------------------------------------------------------------

# AUTH AND RBAC

Hard rules — never weaken for convenience.

1. Roles: `super_admin` \| `admin` only for MVP. No permission-key catalog
   required yet.
2. **User management** (create / deactivate admins): `super_admin` only.
3. All other operational endpoints: `admin` **and** `super_admin`.
4. No public self-registration. Seed the first super admin (Phase 1).
5. Access token: Bearer header. Refresh tokens: store **hash only** in
   Mongo; rotate and hard-delete old tokens on refresh/logout.
6. Guard every protected route. Do not “fix” missing guards inside
   services only — HTTP guards are the primary enforcement.
7. The frontend may hide nav items; **the API is the authority**.

------------------------------------------------------------

# BUSINESS RULES (ALWAYS ENFORCE)

- `remaining = total - discount - paid` on every sales invoice.
- Saving a `customer_sale` with `remaining > 0` increases
  `Customer.balance` by **only** `remaining`. Cash sales do not touch
  balance.
- On-invoice `Payment` (`invoiceId` set): updates invoice `paid` /
  `remaining` only — **does not** change `Customer.balance` (avoids
  double-counting with `+= remaining`).
- Standalone `Payment` (`invoiceId` null, `customerId` set): **does**
  reduce `Customer.balance` by `amount`.
- Saving a sales invoice deducts `Item.stockQuantity` per line; cancelling
  reverses stock and reverses the `balance += remaining` applied at save.
- Saving a purchase invoice increases `Item.stockQuantity` and
  `Supplier.amountOwed`.
- Price/cost changes append `ItemPriceHistory` — never silent overwrite.
- Manual stock corrections call `POST /inventory/adjustments`, which updates
  `Item.stockQuantity` and writes `stock_adjusted` on `AuditLog` with the
  reason. Never a bare field update.
- Dimensions (`thickness` × `width` × `length`, cm) are required on sales
  lines only when item `pricingMode` is `per_cubic_meter`.
  - Volume m³ = `(T × W × L) / 1_000_000` (6 dp).
  - `lineTotal` = `quantity × volume × piecePrice` (cubic) or
    `quantity × piecePrice` (piece).
  - Stock deduct: cubic → `quantity × volume`; piece → `quantity`.
    Negative stock is allowed.
- Cash sales must be fully paid; no overpay/tips. Customer sales:
  `0 ≤ paid ≤ net`. `piecePrice` may be overridden; `costPriceSnapshot`
  always from live `Item.cost`.
- Invoice numbers: `INV-NNNN` via `InvoiceCounter` (sequence keyed by Cairo year).
- On cancel, void on-invoice payments with `reversedAt` / `reversedBy`.

------------------------------------------------------------

# SECURITY

- Never commit secrets, API keys, or real passwords. Use `.env` only
  (gitignored). Never put real credentials in docs, fixtures, or seeds
  committed to git.
- Never log JWTs, refresh tokens, password hashes, or PII dumps (phones,
  balances) in production paths.
- Hash passwords with a modern algorithm (prefer argon2id). Store refresh
  tokens as hashes only.
- Validate all input with DTOs. Treat body/query as untrusted.
- Client-supplied EGP fields must already be finite amounts with at most 2
  decimal places (`piecePrice`, `discount`, `paid`, payment `amount`, purchase
  `unitCost`). Computed totals still round to 2 decimals at write time. Reject
  negative paid amounts and impossible remaining states.
- Do not weaken role guards to “make it work.”

------------------------------------------------------------

# PERFORMANCE

- Prefer indexed queries (`phone`, `balance`, invoice number, dates) as
  documented in `docs/DATABASE.md`. Avoid unbounded `find()` on large
  collections.
- Paginate list endpoints (invoices, customers, audit log, stock).
- Dashboard aggregations should be targeted (date ranges), not full-table
  scans of all history when filters exist.
- Keep invoice create/update/cancel transactional and short-lived — no long
  external calls inside the Mongo session.
- Invoice PDFs are rendered client-side on the frontend; public receipt uses
  `@Public()` `GET /public/sales-invoices/:token` returning self-contained JSON
  (see `FRONTEND_URL` for public WhatsApp receipt URL).
- Do not add Redis, Bull, or a second caching stack unless explicitly
  requested.

------------------------------------------------------------

# CLEAN CODE

- Typed DTOs and Mongoose schemas. Avoid `any` in new code; do not ignore
  TypeScript errors.
- One responsibility per service method. Fail with clear Nest HTTP
  exceptions — never silent failure.
- Reuse before create: search `src/shared/` and neighboring modules.
- Match neighboring import style, naming, and error handling. Do not
  drive-by refactor unrelated files.
- No dead code. No commented-out blocks. No unexplained TODOs for money /
  auth / stock flows.
- Colocate unit tests (`*.spec.ts`). Cover role denial and validation
  reject paths for new endpoints.
- Password and token hash fields: `select: false` and stripped from
  responses.

------------------------------------------------------------

# ERROR HANDLING AND API CONTRACTS

| Concern | Expectation |
|---------|-------------|
| Validation | Global ValidationPipe rejects unknown properties; DTOs own field rules |
| Authn | 401 when missing/invalid JWT |
| Authz | 403 when role checks fail |
| Not found | Domain-appropriate 404 |
| Success / errors | One envelope (chosen in Phase 0) — do not invent a second |

- Do not change public response contracts without updating the frontend.
- Invoice cancel, payment, and stock adjust must leave the DB consistent
  (transaction rollback on failure).

------------------------------------------------------------

# BEFORE WRITING CODE

1. Confirm the phase in `docs/PHASES.md` and that the slice is in scope.
2. Identify the owning feature module and follow its folder layout.
3. Check existing services, schemas, DTOs, and guards in that feature (and
   a similar neighbor).
4. Decide authz: `super_admin` vs `admin` (and `super_admin`).
5. Plan transactions, audit writes, validation, pagination, and failure
   modes before the happy path.
6. Recompute money/stock/balance server-side — never trust the client.
7. Add or update colocated tests for critical authz and money paths.

------------------------------------------------------------

# SELF-CHECK (BEFORE FINISHING)

- [ ] Code lives in the correct feature module; controllers stay thin
- [ ] Role guards applied correctly (`super_admin` vs operational)
- [ ] DTOs validated; unknown fields forbidden
- [ ] Multi-collection mutations use a Mongo transaction
- [ ] AuditLog written in the same transaction (correct `changes` vs refs)
- [ ] Soft-delete / immutability rules respected
- [ ] Money/stock/debt invariants from the business rules section hold
- [ ] No secrets in logs, fixtures, or committed env files
- [ ] List endpoints paginated where appropriate
- [ ] Response envelope unchanged / consistent
- [ ] Unit tests cover the critical path and authz failures
- [ ] No drive-by refactors, no `any` sprawl, no dead code
- [ ] `docs/DATABASE.md` / `docs/OVERVIEW.md` / `docs/PHASES.md` updated if the
      schema, contract, or phase status changed; frontend flagged if the
      API contract changed

------------------------------------------------------------

# FURTHER READING

- [`OVERVIEW.md`](./OVERVIEW.md) — domains, consumers, setup, business overview
- [`../README.md`](../README.md) — public GitHub project README
- [`DATABASE.md`](./DATABASE.md) — Mongo schema and relationships
- [`PHASES.md`](./PHASES.md) — vertical-slice build plan
- [`../../Al-Mohamadia-Frontend/docs/AGENTS.md`](../../Al-Mohamadia-Frontend/docs/AGENTS.md) — UI conventions
- [`.env.example`](../.env.example) — env template
