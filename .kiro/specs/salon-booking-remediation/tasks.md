# Implementation Plan: Salon Booking Remediation

## Overview

This plan wires the existing `salon-booking-system` domain core into a runnable application. It does **not** rebuild the domain services, the shared utilities, the exclusion-constraint migration, or the property tests. Tasks are ordered so each step builds on the previous one: first make the suite green, then stand up the HTTP framework and composition root, then auth, then the routes, then the cross-service wiring, then real adapters, then the clients and an end-to-end test, then the UI, then docs, and finally the opt-in concurrency test and a full-suite checkpoint.

Requirement references point to `requirements.md` in this spec. Where a task also satisfies an original `salon-booking-system` requirement, the original number is noted in parentheses.

## Tasks

- [x] 1. Test hygiene — make `npm test` green offline
  - [x] 1.1 Gate the database-constraint tests behind `DATABASE_URL`
    - Stop constructing `PrismaClient` at module load in `db-constraints.test.ts`; construct it inside a guarded `describe` that runs only when `DATABASE_URL` is set, otherwise `describe.skip`
    - Ensure skipped DB tests are reported as skipped, not errored
    - _Requirements: 1.2, 1.3, 1.4_
  - [x] 1.2 Verify the full suite is green with no external services
    - Run `npm test` with `DATABASE_URL` unset and confirm a passing exit code and that the existing property tests still pass unchanged
    - _Requirements: 1.1, 1.5_

- [x] 2. HTTP API framework and bootstrap
  - [x] 2.1 Decide and install the HTTP framework
    - Attempt NestJS first to stay faithful to the original design; if it does not install/build cleanly in this workspace, fall back to a minimal Express layer wrapping the same services
    - Record the decision and rationale to carry into the README (Task 11)
    - _Requirements: 2.1, 8.4_
  - [x] 2.2 Replace the stub `main.ts` with a real bootstrap
    - Start a server that listens on a configurable `PORT` and expose `GET /healthz`
    - _Requirements: 2.1_

- [x] 3. Composition root wiring all services, adapters, and Prisma
  - [x] 3.1 Implement a `createApp(config)` factory
    - Read configuration from environment; construct the `PrismaClient`; construct every domain service (SchedulingEngine, AuthService, PaymentService, NotificationService, WaitlistService, CustomerService, AnalyticsService, CalendarService, ServiceCatalog, registration, availability-config); select adapters from config; return the app/server handle
    - Fail fast on missing production secrets, or fall back to documented dev defaults
    - _Requirements: 3.1, 3.3, 3.5_
  - [x] 3.2 Route handlers consume injected services
    - Ensure handlers use instances from the composition root and never `new` a domain service inline; confirm no service is instantiated only in its own tests
    - _Requirements: 3.2, 3.4_

- [x] 4. Auth and RBAC HTTP middleware/guards
  - [x] 4.1 JWT access-token authentication middleware
    - Verify the access token, attach the principal, return 401 when missing/invalid on protected routes; apply auth by default so protected routes are never silently unauthenticated
    - _Requirements: 2.3, 2.8_
  - [x] 4.2 RBAC guard enforcing the authorization matrix
    - Enforce Owner/Admin/Stylist permissions (Owner configures; Admin manages appointments; Stylist views only own appointments/notes); deny with 403 `FORBIDDEN` and no state change
    - _Requirements: 2.4 (orig R2)_

- [x] 5. Controllers/routes for each endpoint group with supertest tests
  - [x] 5.1 Auth routes
    - `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh` mapped to `AuthService`; map `OTP_EXPIRED` / `OTP_INVALID`
    - _Requirements: 2.2, 2.5 (orig R1)_
  - [x] 5.2 Salon, QR, and services routes
    - `GET /salons/by-qr/:payload` (distinct `QR_MALFORMED` vs `QR_UNREGISTERED`), `GET /salons/:id/services`
    - _Requirements: 2.2, 2.6, 2.7 (orig R7)_
  - [x] 5.3 Availability route
    - `GET /salons/:id/availability` → `SchedulingEngine.getAvailability`, public
    - _Requirements: 2.2, 2.7 (orig R8)_
  - [x] 5.4 Booking routes
    - `POST /appointments` and `POST /appointments/:id/cancel` and `POST /appointments/:id/no-show`; map `BOOKING_NO_AVAILABILITY` / `BOOKING_SLOT_UNAVAILABLE`
    - _Requirements: 2.2, 2.5 (orig R9, R11)_
  - [x] 5.5 Payment routes
    - `POST /payments/initiate` and `POST /payments/callback` (callback confirms held appointment)
    - _Requirements: 2.2 (orig R10)_
  - [x] 5.6 Admin calendar/analytics and staff/chairs routes
    - `GET /salons/:id/calendar`, `GET /salons/:id/analytics`, `GET /salons/:id/staff`, `GET /salons/:id/chairs` behind RBAC
    - _Requirements: 2.2, 2.4 (orig R15, R16)_
  - [x] 5.7 Supertest route tests
    - Cover status codes, the RBAC matrix (401/403), and the error-code mapping for the route groups above
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

- [x] 6. Cross-service wiring with tests
  - [x] 6.1 BookingFlow — booking and payment-confirm send confirmation
    - Wrap `SchedulingEngine.book` and `confirmHeld` so a confirmed appointment triggers `NotificationService.sendConfirmation`; failures are logged and never roll back the booking
    - _Requirements: 4.1, 4.4, 4.5 (orig R12.1)_
  - [x] 6.2 CancellationFlow and expiry — notify waitlist on free
    - After `CancellationService.cancel` and after `releaseExpiredHolds`, call `WaitlistService.notifyOnFree` for the freed window; failures logged, no rollback
    - _Requirements: 4.2, 4.3, 4.4, 4.5 (orig R13.4)_
  - [x] 6.3 Tests for the wiring
    - Assert confirmation is sent on confirmed booking and on payment confirm, and that cancellation/expiry triggers waitlist notification, using in-memory fakes for the notifier/waitlist
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. Real SMS and push adapters
  - [x] 7.1 Implement fetch-based Kavenegar and SMS.ir adapters
    - Real HTTP `send`, returning `{ok:true, providerId}` on success and `{ok:false, error}` on failure (no throw); config-driven credentials; timeout + structured logging
    - _Requirements: 5.1, 5.3, 5.4, 5.6_
  - [x] 7.2 Implement fetch-based Pushe and Najva adapters
    - Same contract for `PushProvider.send`
    - _Requirements: 5.2, 5.3, 5.4, 5.6_
  - [x] 7.3 Dev/log fallback adapter selection
    - Composition root selects a safe log adapter when credentials are absent
    - _Requirements: 5.5_
  - [x] 7.4 Adapter tests
    - Use mocked `fetch` to assert request payloads, success mapping, and graceful failure (no throw, failure logged)
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 8. Point clients at the real API and add an end-to-end happy-path test
  - [x] 8.1 Configure web and mobile clients to target the real API base URL
    - Drive the base URL from configuration on both clients
    - _Requirements: 6.1_
  - [x] 8.2 Add an opt-in end-to-end happy-path test
    - Boot the real app against a PostgreSQL test database; exercise resolve QR → availability → book → confirmation; assert a confirmed appointment and a dispatched confirmation; skip gracefully when no database is available
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 9. Implement web admin screens wired to the API client
  - [x] 9.1 ConfigurationPage
    - Replace placeholder text with functional staff/chairs/services/holidays management wired to `adminApi`/`salonApi`; show loading/success/error states
    - _Requirements: 7.1, 7.5 (orig R3, R4, R5)_
  - [x] 9.2 CalendarPage
    - Render day/week views from the calendar endpoint
    - _Requirements: 7.2, 7.5 (orig R15)_
  - [x] 9.3 AnalyticsPage
    - Render utilization/revenue/busiest-window data from the analytics endpoint
    - _Requirements: 7.3, 7.5 (orig R16)_

- [x] 10. Implement mobile screens as real React Native components
  - [x] 10.1 AuthScreen
    - Implement the phone → OTP → verify → store tokens flow as a React Native component with loading/success/error states
    - _Requirements: 7.4, 7.5 (orig R1)_
  - [x] 10.2 QrScanScreen
    - Implement QR scan → resolve → navigate as a React Native component, surfacing distinct malformed vs unregistered messages
    - _Requirements: 7.4, 7.5 (orig R7)_

- [x] 11. Documentation and configuration hygiene
  - [x] 11.1 Add a README with run/test/migrate instructions
    - Document install, run the API, run tests, apply migrations; record the HTTP framework decision and rationale
    - _Requirements: 8.1, 8.4_
  - [x] 11.2 Complete `.env.example`
    - Add `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, payment gateway keys, SMS/push provider keys, and the payment callback base URL alongside `DATABASE_URL`
    - _Requirements: 8.2_
  - [x] 11.3 Fix backend `package.json` description
    - Make the description match the chosen framework (remove stale "NestJS backend API" if Express is used)
    - _Requirements: 8.3_

- [x] 12. Opt-in real-PostgreSQL concurrency test (Property 5)
  - [x] 12.1 Add a real-database Property 5 test
    - Fire N parallel `book` calls at the last free (Staff_Member, Chair) pair against a database with the `EXCLUDE` constraints; assert exactly one confirmed and the rest rejected; skip when `DATABASE_URL` is unset; clean up created data
    - **Property 5: Booking race safety (concurrency)**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4 (orig R9.5)**

- [x] 13. Final checkpoint — full build and green test suite
  - [x] 13.1 Build all workspaces and run the full suite
    - Confirm `npm run build` and `npm test` succeed across workspaces; confirm no orphaned services remain and the API boots
    - _Requirements: 1.1, 1.5, 2.1, 3.4_
