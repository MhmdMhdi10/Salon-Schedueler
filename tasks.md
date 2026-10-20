# Retained implementation tasks

This file records requirements kept from the product and QA discussion. Items marked
complete are implemented in this change; explicitly deferred product work remains
listed so it is not lost.

## Current implementation batch

- [x] Service earnest/deposit: create a service with either a fixed amount or a
      percentage without validation errors. Send only the active deposit field; keep
      fixed and percentage values mutually exclusive.
- [x] Subscription renewal window: increase rolling maximum from three months to
      four months (120 days) across backend rules, owner UI copy, and tests.
- [x] Pending payments: do not show pending payment records or pending-payment
      totals in user-facing owner surfaces. Keep operational/platform-admin visibility.
- [x] Firebase web setup: add Firebase SDK, initialize the Ara Firebase app from
      environment variables, enable browser-safe Analytics when supported, and document
      the required Vite variables.

## Retained backlog

These requirements were captured earlier and are intentionally tracked separately
from the current implementation batch:

- [ ] Printed-card order flow: collect location, written address, postal code, and
      print quantity/statistics; continue the order conversation through support.
- [ ] Support system: create a fast error-report/ticket path with staff assignment
      and an optional Telegram/support identifier.
- [ ] Booking and reservation QA backlog: service edit persistence; suggested
      services by business category; booking scroll behavior; rejected/cancelled
      booking SMS and notifications; emergency cancellation with refund policy and
      proof/reason capture; service-duration-aware slot ranges; multi-service booking;
      cancellation controls and compact short-range actions; booking login/session
      preservation; navbar/install icon overlap; homepage motion timing; and mobile
      layout fixes.
- [ ] Explicitly post-MVP: product/documentation items and selling physical products
      through a salon.
