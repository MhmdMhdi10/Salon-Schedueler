# ARA QA regression flows

These scenarios describe the in-scope behavior delivered for the current MVP.
Run them with test notification/SMS providers and seeded data; do not send real
messages or move real money during QA.

## Flow 1 — Customer books, authenticates, and receives a cancellation update

1. Open a salon booking page as an anonymous customer.
2. Select two services, including one with a two-hour duration. Confirm the
   summary shows the combined price and duration.
3. In the first date section, use **هفته بعد** and choose a date. Confirm the
   second date section explains that it changes the selected date.
4. Choose a time. Confirm every offered start has enough continuous availability
   for the combined duration; no 30-minute option appears for a two-hour-only
   selection.
5. Continue to confirmation, return to availability, and confirm the selected
   date/time is still selected.
6. If authentication is required, complete login. Confirm the app returns to
   the same salon, services, date, time, and booking step rather than onboarding
   or a different salon.
7. Submit the booking and verify the appointment persists after refresh and
   login again.
8. Have the salon reject the pending request. Verify the customer receives an
   in-app notification and the configured test SMS provider records a rejection.
9. For a paid confirmed appointment, have the salon perform an emergency
   cancellation with a reason and refund-proof image. Verify the customer sees
   the reason, refund status/due time, and can lazily open the proof image. Verify
   the in-app notification and test SMS are recorded.

## Flow 2 — Owner manages services, schedule, cancellations, and messaging

1. Create a service during salon onboarding. Open the owner service panel after
   onboarding and edit its name, duration, and price. Refresh and sign in again;
   confirm all edits remain.
2. Change the salon category/specialty. Confirm suggested services update while
   custom services remain. Edit both a suggested and a custom service.
3. Force a service-create validation/API failure. Confirm the UI explains what
   failed and what to correct; no phantom service appears.
4. Open the owner calendar in Chrome. Confirm it has one page-level scroll area,
   time runs horizontally, and a two-hour appointment spans four half-hour
   sections while a 30-minute appointment spans one.
5. From a pending request, open details, verify the close X is visible, works,
   and has a 44px touch target. Confirm the accept/cancel surface exposes
   cancellation reason, emergency cancellation, refund-proof upload, and
   report/block controls.
6. Send a direct customer message through the configured test SMS provider.
   Confirm accepted/provider ID status is shown. Simulate provider failure and
   confirm an actionable error plus retry sends the same message.
7. Check the owner header, bottom navigation, and PWA install prompt at mobile
   and desktop widths. Confirm the prompt is right-aligned, supported-only, and
   never covers account/navigation controls.

## Flow 3 — Card order and support triage

1. From the owner QR/marketing area, submit a separate printed-card order with
   contact name, phone, address, quantity, template, paper, finish, sidedness,
   and QR target. Confirm the success screen shows a unique order number and the
   salon inbox receives an order event.
2. In platform admin, open card orders. Confirm the order data and total pieces
   needed for production are visible, printable, and status can move through
   received/contacted/in-print/shipped/completed (or cancelled). Continue any
   customer discussion through the project’s available support/contact channel;
   do not mix the request with appointment booking.
3. Open **پشتیبانی** from the authenticated ARA header. Submit a report with a
   description and optional screenshot. Confirm the response includes a unique
   ticket ID and stores page, action, timestamp, user, browser/device, request
   ID, and error context.
4. In platform admin support, find the ticket, assign it, change priority/status,
   add a resolution, and close it. Confirm the customer’s history reflects the
   updated status and resolution.

## Deferred after MVP

Salon product sales, inventory, cart, checkout, and e-commerce fulfillment are
documented in [post-mvp-backlog.md](./post-mvp-backlog.md) and are intentionally
outside these flows.
