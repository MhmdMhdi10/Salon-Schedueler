# Requirements Document

## Introduction

This spec captures **verified gaps** in the existing `salon-booking-system` project and defines the remediation needed to make that system actually runnable end-to-end. The gaps below were found by building the project and running its test suite, not by reading the design alone.

The original `salon-booking-system` spec produced a strong domain core: framework-agnostic services with constructor injection, a PostgreSQL exclusion-constraint migration, shared pure utilities (QR codec, Jalali conversion, slot math), real Zarinpal/IDPay payment adapters, and 19 property-based tests. Those parts are sound and are **not** to be rebuilt.

What is missing is everything that turns that core into a working application:

- **No HTTP/API layer.** `packages/backend/src/main.ts` only prints a console message; there is no web framework dependency (no NestJS/Express/Fastify), so none of the design's REST endpoints exist.
- **No composition root.** Every domain service is only ever instantiated inside its own unit tests. Nothing wires them into a runnable entrypoint.
- **Clients call a server that does not exist.** The web (`/api`) and mobile (`https://api.salon.app`) clients call REST endpoints no server handles; the "integration tests" only mock `global.fetch`.
- **Cross-service promises not wired.** `SchedulingEngine.book()` never calls `Notification_Service` (R12.1 of the original spec). `CancellationService` and hold-expiry never call `WaitlistService.notifyOnFree` (R13.4).
- **Placeholder adapters.** The SMS adapters (Kavenegar, SMS.ir) and push adapters (Pushe, Najva) always throw "not configured for production use".
- **Red test suite.** `npm test` exits non-zero because `db-constraints.test.ts` instantiates a Prisma client at module load and fails when `DATABASE_URL` is unset; there is no graceful skip.
- **Concurrency property is mocked.** Property 5 (booking race) was supposed to run against real PostgreSQL per the design's testing strategy, but is implemented purely with an in-memory mock.
- **Placeholder UI.** Web admin pages (Configuration, Calendar, Analytics) render literal "placeholder" text. Mobile screens (`AuthScreen.ts`, `QrScanScreen.ts`) are plain objects, not React Native components.
- **Stale docs/config.** `backend/package.json` still calls itself a "NestJS backend API"; there is no README with run instructions; `.env.example` lists only `DATABASE_URL` even though the code reads `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, gateway keys, and a payment callback base URL.

The requirements below define the remediation. They reference the original spec's requirement numbers (for example R12.1, R13.4, R15, R16) where the remediation wires up behavior the original spec already specified.

## Glossary

- **Booking_System / Scheduling_Engine / Notification_Service / Payment_Service / Service_Catalog / Analytics_Service / WaitlistService**: The domain services defined and implemented by the original `salon-booking-system` spec. They are framework-agnostic classes with constructor injection and are reused unchanged except where wiring requires a new collaborator.
- **HTTP_API**: The new thin HTTP layer (controllers/routes + middleware) that exposes the domain services over REST.
- **Composition_Root**: A single module that constructs the Prisma client, the external-provider adapters, and every domain service, then injects them into the HTTP_API.
- **SMS_Adapter / Push_Adapter**: Concrete implementations of the `SmsProvider` / `PushProvider` ports for Iranian providers (Kavenegar, SMS.ir, Pushe, Najva).
- **E2E_Test**: An automated end-to-end test that drives the running HTTP_API across the booking happy path.
- **Opt-in DB test**: A test that runs only when `DATABASE_URL` is set and is skipped (not failed) otherwise.

## Requirements

### Requirement 1: Green Test Suite Without External Services

**User Story:** As a developer, I want `npm test` to pass with no external services running, so that CI is trustworthy and contributors can validate changes locally.

#### Acceptance Criteria

1. WHEN `npm test` is run at the repository root with `DATABASE_URL` unset and no external network access, THE Booking_System test suite SHALL complete with a passing (zero) exit code.
2. IF `DATABASE_URL` is not set, THEN the database-dependent constraint tests SHALL be skipped and reported as skipped rather than errored.
3. WHERE `DATABASE_URL` points to a reachable PostgreSQL instance with migrations applied, THE database-constraint tests SHALL execute and assert the exclusion-constraint behavior.
4. THE test suite SHALL NOT instantiate a database client at module load in a way that throws when `DATABASE_URL` is absent.
5. THE existing property-based tests SHALL continue to pass, unchanged in count and intent.

### Requirement 2: Runnable HTTP API With Auth and RBAC

**User Story:** As a client app (web or mobile), I want a running HTTP server exposing the documented endpoints, so that real requests are served end-to-end instead of mocked.

#### Acceptance Criteria

1. WHEN the backend is started, THE HTTP_API SHALL listen on a configurable port and expose a health endpoint that returns a success status.
2. THE HTTP_API SHALL expose endpoints for OTP request, OTP verify, and token refresh; salon QR resolve; service list; availability; create appointment; cancel appointment; payment initiate; payment gateway callback; admin calendar; admin analytics; staff list; and chairs list, consistent with the original design's API surface table.
3. WHEN a request to a protected route carries a valid JWT access token, THE HTTP_API SHALL authenticate the principal; IF the access token is missing or invalid, THEN THE HTTP_API SHALL respond with 401 and SHALL NOT perform the requested action.
4. WHERE a route requires a specific Role, THE HTTP_API SHALL enforce the original authorization matrix (R2) and SHALL respond with 403 `FORBIDDEN` and no state change when the principal is not permitted.
5. WHEN a domain operation fails with a known condition, THE HTTP_API SHALL map it to the original design's stable error code (for example `OTP_EXPIRED`, `OTP_INVALID`, `VALIDATION_ERROR`, `BOOKING_NO_AVAILABILITY`, `BOOKING_SLOT_UNAVAILABLE`, `QR_MALFORMED`, `QR_UNREGISTERED`, `FORBIDDEN`).
6. WHEN a scanned salon QR payload is malformed versus unregistered, THE HTTP_API SHALL return distinct error codes (`QR_MALFORMED` versus `QR_UNREGISTERED`).
7. THE availability endpoint and the QR resolve endpoint SHALL be publicly accessible without authentication, consistent with the original design.
8. WHEN the HTTP_API exposes any network-reachable route, THE auth middleware SHALL be applied by default so that protected routes are not silently left unauthenticated.

### Requirement 3: Composition Root Wiring All Services

**User Story:** As a maintainer, I want a single place that constructs and wires every domain service and adapter, so that no module is orphaned from the runnable application.

#### Acceptance Criteria

1. THE Composition_Root SHALL construct the Prisma client, the SMS/push/payment adapters, and every domain service (SchedulingEngine, PaymentService, AuthService, NotificationService, WaitlistService, CustomerService, AnalyticsService, CalendarService, ServiceCatalog, resource registration, availability-config).
2. WHEN the HTTP_API handles a request, THE route handler SHALL use service instances provided by the Composition_Root and SHALL NOT construct domain services ad hoc inside the handler.
3. THE Composition_Root SHALL read configuration (database URL, JWT secrets, gateway keys, provider keys, payment callback base URL) from environment variables.
4. THE Booking_System SHALL contain no domain service that is only ever instantiated within its own test files; every service SHALL be reachable from the runnable entrypoint.
5. IF a required secret needed for production operation is absent at startup, THEN THE Composition_Root SHALL either fail fast with a descriptive error or select an explicitly documented safe development default.

### Requirement 4: Booking Confirmation and Waitlist Notification Wiring

**User Story:** As a customer, I want a confirmation when my booking is confirmed and a notification when a slot I am waitlisted for frees up, so that the notification behavior the original spec promised actually happens.

#### Acceptance Criteria

1. WHEN an Appointment becomes confirmed (a deposit-free booking, or a held booking confirmed after payment), THE Booking_System SHALL invoke Notification_Service to send a confirmation to the Customer (original R12.1).
2. WHEN an Appointment is cancelled and a (Staff_Member, Chair) pair becomes free for a waitlisted window, THE Booking_System SHALL invoke `WaitlistService.notifyOnFree` for that window (original R13.4).
3. WHEN a held Appointment expires and its resources are released, THE Booking_System SHALL invoke `WaitlistService.notifyOnFree` for the freed window (original R13.4).
4. IF confirmation or waitlist-notification delivery fails, THEN the failure SHALL be recorded and SHALL NOT roll back the confirmed Appointment or the release of resources (consistent with the original R12.4 no-fallback logging rule).
5. THE wiring SHALL live in the composition/application layer so that the SchedulingEngine and CancellationService remain framework-agnostic and independently testable.

### Requirement 5: Real, Configuration-Driven SMS and Push Adapters

**User Story:** As an operator, I want the SMS and push adapters to make real configured HTTP calls and degrade gracefully, so that notifications actually send in production without crashing the system.

#### Acceptance Criteria

1. WHEN configured with valid provider credentials, THE SMS_Adapters (Kavenegar, SMS.ir) SHALL send messages via real HTTP requests to the provider API and return a success result that includes a provider message id.
2. WHEN configured with valid credentials, THE Push_Adapters (Pushe, Najva) SHALL deliver push payloads via real HTTP requests and return a success result.
3. IF a provider returns an error or the HTTP request fails, THEN the adapter SHALL return a structured failure result (`{ ok: false, error }`) instead of throwing an unrecoverable error, and the failure SHALL be logged.
4. THE adapters SHALL NOT throw a "not configured for production use" error when provider credentials are present.
5. WHERE provider credentials are absent, THE Composition_Root SHALL select a safe development adapter (for example one that logs the message) so the system still runs without external credentials.
6. THE adapters SHALL read endpoint and credential configuration from environment-driven configuration rather than hard-coded secrets.

### Requirement 6: Clients Target the Real API With an End-to-End Test

**User Story:** As a QA engineer, I want the clients pointed at the real API and an automated end-to-end test of the booking happy path, so that the full stack is verified rather than only mocks.

#### Acceptance Criteria

1. THE web and mobile API clients SHALL target the real running API base URL through configuration.
2. THE Booking_System SHALL provide an E2E_Test that, against a running server, exercises resolve QR, then list availability, then create a booking, then receive a confirmation.
3. WHEN the E2E_Test runs against a properly configured environment, THE test SHALL assert that a confirmed Appointment was created and that a confirmation was dispatched.
4. IF the end-to-end environment (a PostgreSQL database) is not available, THEN the E2E_Test SHALL be skipped gracefully and SHALL NOT fail the default test suite.
5. THE existing `fetch`-mock integration tests MAY remain as adapter-level checks but SHALL NOT be the only verification of the API contract.

### Requirement 7: Functional Web Admin and Mobile Screens

**User Story:** As a salon owner and as a customer, I want functional admin and mobile screens instead of placeholder text, so that the application is actually usable.

#### Acceptance Criteria

1. THE web admin ConfigurationPage SHALL render functional staff, chairs, services, and holidays management wired to the API client, with no literal "placeholder" text remaining.
2. THE web admin CalendarPage SHALL render day and week appointment views fetched from the calendar endpoint (original R15).
3. THE web admin AnalyticsPage SHALL render utilization, revenue, and busiest-window data fetched from the analytics endpoint (original R16).
4. THE mobile AuthScreen and QrScanScreen SHALL be implemented as React Native components (not plain objects) that drive the documented authentication and QR flows.
5. WHEN a screen performs an API action, THE screen SHALL surface loading, success, and error states to the user.

### Requirement 8: Documentation and Configuration Hygiene

**User Story:** As a new contributor, I want accurate documentation and configuration, so that I can run, test, and migrate the project without guessing.

#### Acceptance Criteria

1. THE repository SHALL include a README documenting how to install dependencies, run the API, run tests, and apply database migrations.
2. THE backend `.env.example` SHALL document every environment variable the code reads, including `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, the payment gateway keys, the SMS/push provider keys, and the payment callback base URL.
3. THE backend `package.json` description SHALL accurately reflect the chosen HTTP framework and SHALL NOT retain a stale "NestJS backend API" description if NestJS is not the framework used.
4. THE README SHALL record which HTTP framework was selected and the reason for the choice.

### Requirement 9: Concurrency Property Validated Against Real PostgreSQL (Opt-In)

**User Story:** As a developer, I want Property 5 (booking race safety) validated against a real PostgreSQL instance when one is available, so that the database-level race guarantee is actually exercised rather than simulated by a mock.

#### Acceptance Criteria

1. WHERE `DATABASE_URL` points to a PostgreSQL instance with the exclusion constraints applied, THE opt-in Property 5 test SHALL fire concurrent booking attempts at the last free (Staff_Member, Chair) pair and assert exactly one is confirmed and all others are rejected (original R9.5).
2. IF `DATABASE_URL` is not set, THEN the real-PostgreSQL Property 5 test SHALL be skipped and the existing mock-based Property 5 test SHALL remain in place and pass.
3. THE real-PostgreSQL Property 5 test SHALL exercise the actual `EXCLUDE` constraints with no mock substituting for the database.
4. THE opt-in test SHALL clean up the data it creates.
