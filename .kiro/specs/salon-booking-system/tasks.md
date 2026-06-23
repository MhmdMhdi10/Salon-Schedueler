# Implementation Plan: Salon Booking System

## Overview

This plan implements the Salon Booking System incrementally in TypeScript, as specified in the design: a NestJS backend on PostgreSQL, a shared package of pure domain logic, a React PWA, and a React Native app. The build order is data-model first, then pure utilities, then the domain services (catalog, auth, scheduling, payments, notifications, analytics), then the two client surfaces, then localization and offline resilience. Each task wires its output into the work that precedes it so there is no orphaned code.

Property-based tests use **fast-check** with a minimum of 100 iterations and are tagged **Feature: salon-booking-system, Property N: ...**. Sub-tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation sub-tasks are never optional.

## Tasks

- [x] 1. Scaffold the monorepo and shared foundation
  - Create npm workspaces with `packages/shared`, `packages/backend`, `packages/web`, `packages/mobile`
  - Configure TypeScript, ESLint/Prettier, and test runners (Jest + fast-check for backend/shared, Vitest for web)
  - Add the `shared` package with domain type stubs and Zod schema scaffolding, and wire it as a dependency of the other three packages
  - _Requirements: 18.1, 18.2_

- [x] 2. Define the data model and database constraints
  - [x] 2.1 Author the Prisma schema for all core entities
    - Model salon, staff_member, chair, equipment + mapping tables, service + service_staff/service_equipment, working_hours, day_off, chair_unavailable, holiday, customer, customer_note, appointment, payment, waitlist_entry, otp, device_token, notification_log
    - Encode enums (staff_role, appt_status, appt_source, payment_status) and money as `bigint` Rial
    - _Requirements: 2.1, 3.1, 3.2, 5.1, 6.1, 10.5, 14.1, 14.2_
  - [x] 2.2 Add raw SQL migration for occupancy ranges and exclusion constraints
    - Enable `btree_gist`; add `time_range tstzrange`; add `no_staff_overlap` and `no_chair_overlap` EXCLUDE constraints scoped to `status IN ('held','confirmed')`
    - Add `CHECK` constraints for duration > 0, buffer >= 0, price >= 0, deposit >= 0
    - _Requirements: 5.3, 5.4, 9.3, 9.4, 10.4_
  - [x] 2.3 Write database-constraint tests
    - Assert overlapping `held`/`confirmed` inserts for the same staff or chair are rejected, and that moving to `cancelled`/`no_show`/`expired` frees the resource
    - _Requirements: 9.3, 9.4_

- [x] 3. Implement shared pure utilities (QR codec, Jalali, time-slot math)
  - [x] 3.1 Implement the QR payload codec in `shared`
    - `encodeSalonQr(token)` producing a versioned deep link with checksum; `parseSalonQr(payload)` returning `{kind:'ok',salonToken}` or `{kind:'malformed'}`
    - _Requirements: 7.1, 7.3, 7.5_
  - [x] 3.2 Write property test for QR round-trip and malformed detection
    - **Property 11: QR payload round-trip and malformed detection**
    - **Validates: Requirements 7.1, 7.3, 7.5**
  - [x] 3.3 Implement Jalali conversions in `shared`
    - `gregorianToJalali` / `jalaliToGregorian` using the `jalaali-js` kernel; add a `dayjs` Jalali formatter for display
    - _Requirements: 17.3, 17.4_
  - [x] 3.4 Write property test for Jalali round-trip
    - **Property 12: Jalali calendar round-trip**
    - **Validates: Requirements 17.4**
  - [x] 3.5 Implement time-slot and interval helpers in `shared`
    - Occupancy interval = duration + buffer; overlap predicate; candidate-start generation over open windows
    - _Requirements: 5.2_

- [x] 4. Implement Authentication_Service (OTP) and authorization
  - [x] 4.1 Implement OTP issuance and verification
    - 6-digit code generation, hashed storage with 120s expiry, invalidate-previous-on-reissue, verify with match + window + latest-only checks; issue JWT access/refresh on success
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 4.2 Write property test for OTP validity window and latest-only
    - **Property 14: OTP validity window and latest-only**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
  - [x] 4.3 Write unit test for OTP generation and dispatch
    - With a mocked SmsProvider, assert a 6-digit code is generated and dispatched once
    - _Requirements: 1.1_
  - [x] 4.4 Implement the RBAC authorizer and route guards
    - Roles {Owner, Admin, Stylist}; matrix for configuration, appointment management, and own-appointment/notes viewing; Owner config access invariant
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 14.4_
  - [x] 4.5 Write property test for the authorization matrix
    - **Property 15: Role-based authorization matrix**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 14.4**

- [x] 5. Implement Service_Catalog and resource configuration
  - [x] 5.1 Implement service creation with validation
    - Zod + persistence for name/duration/buffer/price/deposit; reject non-positive duration and negative buffer/price with structured errors
    - _Requirements: 5.1, 5.3, 5.4_
  - [x] 5.2 Write property test for service-definition validation
    - **Property 10: Service-definition validation**
    - **Validates: Requirements 5.3, 5.4**
  - [x] 5.3 Implement service-to-staff and service-to-equipment mapping
    - Endpoints to set qualified staff and required equipment per service
    - _Requirements: 6.1, 6.3_
  - [x] 5.4 Implement salon, staff, chair, and equipment registration with QR token
    - Owner-guarded CRUD; generate the unique `qr_token` on salon creation and a QR fetch endpoint; QR resolution endpoint distinguishing unregistered vs malformed
    - _Requirements: 3.1, 3.2, 7.1, 7.2, 7.4, 7.5_
  - [x] 5.5 Implement working hours, breaks, days off, chair unavailability, and holidays
    - Owner-guarded configuration for staff and chair availability and salon holidays
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Checkpoint - foundation and configuration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Scheduling_Engine availability
  - [x] 7.1 Implement `getAvailability`
    - Compute qualified-and-available staff and compatible-and-available chairs (honoring hours, breaks, days off, chair unavailability, holidays, equipment), then emit slots where a free staff and free chair both exist; empty when none
    - _Requirements: 4.4, 4.5, 6.2, 6.3, 8.1, 8.2, 8.3, 8.4_
  - [x] 7.2 Write property test for availability soundness
    - **Property 3: Availability soundness**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 4.4, 4.5**

- [x] 8. Implement Scheduling_Engine booking with the double-resource constraint
  - [x] 8.1 Implement `book` for non-deposit services
    - Serializable transaction that selects a qualified staff + compatible chair, inserts the appointment occupancy, catches exclusion violations with bounded retry, and returns confirmed / rejected; produce the success confirmation payload
    - _Requirements: 9.1, 9.2, 9.6, 9.7, 13.1_
  - [x] 8.2 Write property test for booking validity / double-resource reservation
    - **Property 2: Booking validity / double-resource reservation**
    - **Validates: Requirements 9.1, 5.2, 6.2, 6.3**
  - [x] 8.3 Write property test for the no-double-booking invariant
    - **Property 1: No double-booking invariant (staff and chair)**
    - **Validates: Requirements 9.3, 9.4, 3.3, 3.4, 13.1**
  - [x] 8.4 Write property test for availability–booking consistency
    - **Property 4: Availability–booking consistency**
    - **Validates: Requirements 9.2, 9.6, 8.1**
  - [x] 8.5 Write property test for booking race safety (concurrency harness)
    - **Property 5: Booking race safety (concurrency)**
    - **Validates: Requirements 9.5**

- [x] 9. Checkpoint - core scheduling correctness
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Payment_Service, deposit holds, and gateway adapters
  - [x] 10.1 Implement the held-booking path and hold-expiry release
    - Extend `book` to create `held` appointments with `hold_expires_at` for deposit services; implement the worker `releaseExpiredHolds` that flips expired holds to `expired` in a single update
    - _Requirements: 10.1, 10.4_
  - [x] 10.2 Write property test for atomic hold and release
    - **Property 6: Atomic hold and release**
    - **Validates: Requirements 10.4, 10.1**
  - [x] 10.3 Implement the `PaymentGateway` port with Zarinpal and IDPay adapters
    - request → redirect → verify → refund flow; amounts as integer Rial; `initiateDeposit`, `handleCallback`, `confirmHeld`
    - _Requirements: 10.2, 10.3, 10.5_
  - [x] 10.4 Implement late-deposit re-verification
    - Accept payment after expiry, re-verify availability inside a transaction before confirming, refund if no longer free
    - _Requirements: 10.6_
  - [x] 10.5 Write property test for late-deposit re-verification
    - **Property 7: Late-deposit re-verification**
    - **Validates: Requirements 10.6**
  - [x] 10.6 Write integration tests for gateway adapters
    - Zarinpal/IDPay request→verify against sandbox or recorded fixtures; assert request precedes confirmation
    - _Requirements: 10.2, 10.3_

- [x] 11. Implement cancellation, no-show, and refund policy
  - [x] 11.1 Implement cancel and mark-no-show
    - Release resources by status change; increment customer no-show count on no-show
    - _Requirements: 11.1, 11.4_
  - [x] 11.2 Write property test for cancellation/no-show resource release
    - **Property 8: Cancellation and no-show free resources**
    - **Validates: Requirements 11.1, 11.4**
  - [x] 11.3 Implement deposit refund/retain policy around the Cancellation_Window
    - Refund before the window, retain within it, via the gateway adapter
    - _Requirements: 11.2, 11.3_
  - [x] 11.4 Write property test for the deposit refund policy
    - **Property 9: Deposit refund policy**
    - **Validates: Requirements 11.2, 11.3**

- [x] 12. Implement Notification_Service and the reminder worker
  - [x] 12.1 Implement `SmsProvider`/`PushProvider` ports with local adapters
    - Kavenegar/SMS.ir SMS adapter (primary); Pushe/Najva push adapter (additive); device-token registration
    - _Requirements: 12.1, 12.3_
  - [x] 12.2 Implement confirmation, reminder dispatch, and failure logging
    - Send confirmation on booking; worker scans appointments entering Reminder_Lead_Time and sends SMS, plus push when enabled; log SMS failures with no fallback
    - _Requirements: 12.1, 12.2, 12.4_
  - [x] 12.3 Write property test for reminder channel selection
    - **Property 17: Reminder channel selection**
    - **Validates: Requirements 12.2, 12.3**
  - [x] 12.4 Write unit test for SMS-failure logging
    - Force provider failure; assert one failure log row and no further delivery attempts
    - _Requirements: 12.4_

- [x] 13. Implement walk-ins and the waitlist
  - [x] 13.1 Implement waitlist join, full-window offer, and notify-on-free
    - Offer waitlist when availability is empty; store FIFO entries; notify the earliest-joined customer when a pair frees (hooked into release/cancel paths)
    - _Requirements: 13.2, 13.3, 13.4_
  - [x] 13.2 Write property test for waitlist FIFO ordering
    - **Property 13: Waitlist FIFO ordering**
    - **Validates: Requirements 13.3, 13.4**
  - [x] 13.3 Write unit test for walk-in double-resource enforcement
    - Create walk-in appointments and assert they obey the same overlap constraints
    - _Requirements: 13.1_

- [x] 14. Implement customer profile, history, and preferred staff
  - [x] 14.1 Implement history, notes, and preferred-staff preselection
    - Customer past appointments and free-text notes (role-gated read); preselect preferred staff when qualified and free during booking
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [x] 14.2 Write property test for preferred-staff preselection
    - **Property 18: Preferred-staff preselection**
    - **Validates: Requirements 14.3**

- [x] 15. Implement admin calendar and Analytics_Service
  - [x] 15.1 Implement per-chair and per-staff day/week calendar endpoints
    - Return appointments in range reflecting create/modify/cancel from any client
    - _Requirements: 15.1, 15.2, 15.3_
  - [x] 15.2 Implement utilization, revenue, and busiest-window analytics
    - Chair/staff utilization = booked/available clamped to [0,1]; revenue sum in Rial; busiest-window argmax
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - [x] 15.3 Write property test for utilization and revenue correctness
    - **Property 16: Utilization and revenue correctness**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4**

- [x] 16. Checkpoint - backend feature-complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Build the web PWA (React + Vite)
  - [x] 17.1 Implement auth, QR landing, availability, and booking flows
    - Phone+OTP screens, QR-resolved salon landing, service/date availability view, booking with payment redirect handling, success confirmation
    - _Requirements: 1.1, 1.2, 7.2, 8.1, 9.7, 10.2_
  - [x] 17.2 Implement admin configuration, calendar, and analytics screens
    - Resource/service/hours/holiday configuration, day/week calendar per chair and staff, analytics dashboards (role-gated)
    - _Requirements: 3.1, 3.2, 4.1, 5.1, 15.1, 15.2, 16.1_
  - [x] 17.3 Configure PWA shell with Workbox service worker
    - Manifest, installability, offline app shell
    - _Requirements: 18.1_
  - [x] 17.4 Write smoke test for PWA manifest and service-worker registration
    - _Requirements: 18.1_

- [x] 18. Build the React Native mobile app with offline resilience
  - [x] 18.1 Implement auth, QR scan, availability, and booking
    - Phone+OTP, camera QR scan resolving the salon, availability and booking with payment redirect, push-token registration
    - _Requirements: 1.1, 7.2, 8.1, 9.7, 12.3_
  - [x] 18.2 Implement the offline cache and submission outbox
    - Cache latest appointments in SQLite; show cached data offline and an empty-state when nothing is cached; queue failed booking submissions and report the failure
    - _Requirements: 18.3, 18.4, 18.5_
  - [x] 18.3 Write property test for offline submission preservation
    - **Property 19: Offline submission preservation**
    - **Validates: Requirements 18.5**
  - [x] 18.4 Configure release builds for Cafe Bazaar and Myket
    - Store-targeted Android build configuration and artifacts
    - _Requirements: 18.2_
  - [x] 18.5 Write smoke test for the release build configuration
    - _Requirements: 18.2_

- [x] 19. Implement Persian localization, RTL, and Jalali display across clients
  - [x] 19.1 Wire i18next Persian default, RTL root direction, and Jalali date formatting
    - Apply the shared Jalali formatter to all date/time rendering in web and mobile
    - _Requirements: 17.1, 17.2, 17.3_
  - [x] 19.2 Write smoke tests for Persian default bundle and RTL direction
    - _Requirements: 17.1, 17.2_

- [x] 20. Final integration and wiring
  - [x] 20.1 Wire clients to the full API and confirm end-to-end flows in automated tests
    - Connect web and mobile to auth, availability, booking, payments, notifications; ensure no orphaned modules remain
    - _Requirements: 9.7, 10.3, 12.1, 15.3_
  - [x] 20.2 Write integration tests for the QR-to-booking-to-confirmation path
    - _Requirements: 7.2, 8.1, 9.1, 9.7_

- [x] 21. Final checkpoint - ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests and smoke checks) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirement sub-clauses for traceability.
- Property tests use fast-check with a minimum of 100 iterations and are tagged **Feature: salon-booking-system, Property N: ...**; each maps to exactly one property from the design.
- The concurrency property (Property 5) is validated against a real PostgreSQL instance with the exclusion constraints, not mocks.
- Checkpoints (tasks 6, 9, 16, 21) provide incremental validation points.
