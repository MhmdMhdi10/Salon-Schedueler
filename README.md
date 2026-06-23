# Salon Booking System

An appointment scheduling platform for the Iranian salon market. The project is a
TypeScript monorepo managed with npm workspaces:

| Workspace | Package | Purpose |
| --- | --- | --- |
| `packages/shared` | `@salon/shared` | Framework-agnostic pure utilities (QR codec, Jalali date conversion, slot/interval math) shared across all packages. |
| `packages/backend` | `@salon/backend` | HTTP API and domain services (scheduling, auth, payment, notifications, waitlist, analytics, catalog). |
| `packages/web` | `@salon/web` | Web PWA (customer booking + admin console). |
| `packages/mobile` | `@salon/mobile` | React Native mobile client. |

## Prerequisites

- **Node.js >= 20** (see the `engines` field in the root `package.json`).
- **npm** (workspaces; ships with Node).
- **PostgreSQL** for full functionality. The scheduling integrity guarantees rely on
  PostgreSQL's `btree_gist` extension and `EXCLUDE` constraints (see
  [Database migrations](#database-migrations)). The unit and property test suites run
  without a database; only the database-backed tests require one.

## Install

Install all workspace dependencies from the repository root:

```bash
npm install
```

npm workspaces hoist and link the packages, so a single root install covers every
package (`@salon/shared`, `@salon/backend`, `@salon/web`, `@salon/mobile`).

## Run the API

Build the backend, then start it:

```bash
npm run build --workspace @salon/backend
npm start  --workspace @salon/backend
```

For an iterative development loop you can instead run the TypeScript entry point
directly:

```bash
npm run start:dev --workspace @salon/backend
```

The server listens on `PORT` (default **3000**) and exposes a public liveness
endpoint:

```bash
curl http://localhost:3000/healthz
# -> {"status":"ok"}
```

Configuration is read from environment variables (see
[`packages/backend/.env.example`](packages/backend/.env.example)). In development,
safe defaults are used for missing secrets; in production
(`NODE_ENV=production`) the server fails fast if a required secret is absent.

## Run tests

Run the full suite across all workspaces from the root:

```bash
npm test
```

The suite is designed to pass **offline, with no external services running**.
Database-dependent and opt-in tests are skipped (reported as skipped, not failed)
unless `DATABASE_URL` is set:

- the exclusion-constraint tests (`db-constraints`),
- the opt-in end-to-end happy-path test,
- the opt-in real-PostgreSQL concurrency test (Property 5).

The mock-based concurrency test and the rest of the property-based tests run on every
offline `npm test`. When `DATABASE_URL` points at a reachable PostgreSQL instance with
migrations applied, the gated tests execute and exercise the real database behavior.

## Database migrations

The backend uses Prisma. Generate the client and apply migrations against the database
named by `DATABASE_URL`:

```bash
npm run prisma:generate --workspace @salon/backend
npm run prisma:migrate  --workspace @salon/backend
```

`prisma:migrate` applies every migration under
`packages/backend/prisma/migrations`, including the hand-authored raw SQL migration
`00000000000001_exclusion_constraints/migration.sql`. That migration enables the
`btree_gist` extension and adds the `EXCLUDE` constraints that make the
double-resource booking invariant correct by construction, so it **must** be applied
for the scheduling guarantees (and the database-backed tests) to hold. It requires a
PostgreSQL database where the `btree_gist` extension is available. For non-interactive
production rollouts, use `prisma migrate deploy` against the same migrations directory.

## HTTP framework decision

The backend uses a **minimal Express layer**.

The original design specified **NestJS** as the first choice and named a minimal
Express layer as the sanctioned fallback. We took that fallback deliberately: the
domain services are already framework-agnostic plain classes wired by constructor
injection, so there is nothing for NestJS's dependency-injection container to add here.
A thin Express layer keeps the runtime lean, avoids the decorator / `reflect-metadata`
/ `tsconfig` overhead, and keeps the test toolchain simple — route tests run
in-process with `supertest` against the app built by the composition root. The choice
only changes the controller/middleware glue; the identical service instances are
injected either way.

## Architecture

The domain services (scheduling, auth, payment, notifications, waitlist, analytics,
catalog, registration, availability config) are **framework-agnostic** classes that
take their collaborators via constructor injection. They are constructed in exactly one
place — the composition root at
[`packages/backend/src/composition-root.ts`](packages/backend/src/composition-root.ts) —
which reads configuration, builds the Prisma client, selects the external
provider/payment adapters (falling back to dev/log adapters when credentials are
absent), and injects everything into the HTTP layer. Route handlers consume those
injected instances and never construct services ad hoc.

Cross-service orchestration that the domain services intentionally do not own lives in
a thin application layer at
[`packages/backend/src/app`](packages/backend/src/app): `BookingFlow` sends a
confirmation after a booking is confirmed (directly or via the payment callback), and
`CancellationFlow` notifies the waitlist when a cancellation or hold expiry frees a
resource window. These flows wrap the engine so `SchedulingEngine` and
`CancellationService` stay framework-agnostic and independently testable.
