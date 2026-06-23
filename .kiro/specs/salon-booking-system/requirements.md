# Requirements Document

## Introduction

The Salon Booking System is an appointment scheduling platform for hair salons, beauty salons, and similar appointment-based service businesses in the Iranian market. The platform serves two client surfaces: a scheduling web app (used by salon owners, admins, and receptionists to manage schedules, and by customers to book through a browser) and a React Native mobile app (used primarily by customers, and optionally by staff).

The central onboarding flow is QR-code based: each salon receives printed QR cards to hand to customers. A customer scans the card, lands in the web or mobile app, sees the free time slots for the salon, and books a service.

The defining scheduling rule is double-resource booking: every appointment must simultaneously reserve a qualified staff member and a compatible chair (station) for the same time window, including buffer time. The system must also support service catalogs with per-service duration/price/buffer, service-to-staff mapping, configurable working hours, walk-ins, waitlists, no-show and cancellation handling, deposit payments through local gateways, reminders, customer history, admin calendar views, and utilization analytics.

The platform targets the Iranian market and must support Persian language, right-to-left layout, the Jalali (Shamsi) calendar, phone + OTP authentication, local payment gateways (Zarinpal/IDPay) settling in Iranian Rial, distribution via local Android stores (Cafe Bazaar, Myket) and a PWA, and resilience to unstable connectivity.

### Out of Scope (Possible Future Phases)

The following are explicitly deferred and are not covered by the acceptance criteria below: customer reviews and ratings, recurring/repeating appointments, and multi-location (chain) management. These may be added in a future revision.

## Glossary

- **Booking_System**: The overall salon booking and scheduling platform, including the web app client, the mobile app client, and the shared backend.
- **Scheduling_Engine**: The backend component that computes availability and enforces booking constraints, including the double-resource constraint.
- **Authentication_Service**: The component that handles phone + OTP login for customers and account and role management for staff.
- **Notification_Service**: The component that sends SMS and push notifications, including confirmations and reminders.
- **Payment_Service**: The component that integrates with local payment gateways to collect and refund deposits in Iranian Rial.
- **Service_Catalog**: The component that stores services and their attributes (duration, price, buffer time) and the mapping of services to staff and required equipment.
- **Analytics_Service**: The component that computes utilization, busiest-time, and revenue summaries.
- **Salon**: A business that uses the Booking_System; a Salon owns Staff_Members, Chairs, and Services.
- **Staff_Member**: A service provider (for example a stylist) employed by a Salon.
- **Chair**: A physical workstation at a Salon; each Chair has its own schedule.
- **Service**: An offering provided by a Salon, defined by a name, a duration, a price, and a Buffer_Time.
- **Appointment**: A confirmed reservation that occupies exactly one Staff_Member and exactly one Chair for one continuous time window.
- **Customer**: An end user who books Appointments through the web app or the mobile app.
- **Owner**: A staff role with full configuration authority over a Salon.
- **Admin**: A staff role (receptionist) able to manage schedules and appointments but not all Salon settings.
- **Stylist**: A staff role representing a service provider with access limited to assigned appointments and customer notes.
- **Role**: One of the values Owner, Admin, or Stylist assigned to a staff account.
- **Time_Slot**: A discrete bookable interval offered to a Customer for a selected Service.
- **Buffer_Time**: The cleanup or turnover time reserved after a Service before the Staff_Member and Chair become free again.
- **Hold_Period**: The configurable duration for which a Staff_Member and Chair are held while a deposit payment is pending.
- **Cancellation_Window**: The configurable lead time before an Appointment start within which cancellation policy changes (for example deposit forfeiture).
- **Reminder_Lead_Time**: The configurable lead time before an Appointment start at which a reminder is sent.
- **Waitlist**: An ordered list of Customers waiting for a fully booked time window.
- **No_Show**: A state recorded when a Customer fails to attend a confirmed Appointment.
- **Jalali_Calendar**: The Persian (Shamsi) calendar used for all date and time display.
- **OTP**: A one-time password sent to a Customer's phone number for authentication.
- **PWA**: A Progressive Web App accessible through a browser without installation from an app store.

## Requirements

### Requirement 1: Customer Authentication via Phone and OTP

**User Story:** As a customer, I want to log in with my phone number and a one-time password, so that I can book appointments without managing a separate password.

#### Acceptance Criteria

1. WHEN a customer submits a phone number, THE Authentication_Service SHALL send a 6-digit OTP to that phone number.
2. WHEN a customer submits an OTP that matches the issued code within 120 seconds of issuance, THE Authentication_Service SHALL authenticate the customer.
3. IF a customer submits an OTP more than 120 seconds after issuance, THEN THE Authentication_Service SHALL reject the code and require a new OTP.
4. IF a customer submits an OTP that does not match the issued code, THEN THE Authentication_Service SHALL reject the authentication attempt and leave the customer unauthenticated.
5. WHEN a customer requests a new OTP for a phone number with an active OTP, THE Authentication_Service SHALL invalidate the previous OTP and issue a new OTP.

### Requirement 2: Staff Accounts and Role-Based Permissions

**User Story:** As a salon owner, I want staff accounts with distinct roles, so that each person has only the capabilities appropriate to their job.

#### Acceptance Criteria

1. THE Authentication_Service SHALL assign each staff account exactly one Role from the set {Owner, Admin, Stylist}.
2. WHERE an account holds the Owner Role, THE Booking_System SHALL permit configuration of Salon settings, Staff_Members, Chairs, and Services.
3. WHERE an account holds the Owner Role or the Admin Role, THE Booking_System SHALL permit creating, modifying, and cancelling Appointments for the Salon.
4. IF an account holding the Stylist Role attempts to modify Salon configuration, THEN THE Booking_System SHALL deny the action and leave the configuration unchanged.
5. WHERE an account holds the Stylist Role, THE Booking_System SHALL permit viewing that staff member's own assigned Appointments and the associated customer notes.
6. THE Booking_System SHALL ensure that an account holding the Owner Role retains Salon configuration access regardless of system state.

### Requirement 3: Salon and Resource Configuration

**User Story:** As a salon owner, I want to register my staff members and chairs, so that the system knows which resources can be scheduled.

#### Acceptance Criteria

1. WHERE an account holds the Owner Role, THE Booking_System SHALL allow registering one or more Staff_Members for the Salon.
2. WHERE an account holds the Owner Role, THE Booking_System SHALL allow registering one or more Chairs for the Salon.
3. THE Booking_System SHALL maintain a separate schedule for each Chair.
4. THE Booking_System SHALL maintain a separate schedule for each Staff_Member.

### Requirement 4: Working Hours, Breaks, Days Off, and Holidays

**User Story:** As a salon owner, I want to configure when staff and chairs are available, so that customers can only book real availability.

#### Acceptance Criteria

1. THE Booking_System SHALL allow configuration of working hours, breaks, and days off for each Staff_Member.
2. THE Booking_System SHALL allow configuration of working hours and unavailable periods for each Chair.
3. THE Booking_System SHALL allow configuration of Salon holidays that apply to the whole Salon.
4. WHILE a Staff_Member is outside configured working hours, within a break, or on a day off, THE Scheduling_Engine SHALL exclude that Staff_Member from availability.
5. WHILE a date is configured as a Salon holiday, THE Scheduling_Engine SHALL exclude that date from availability.

### Requirement 5: Service Catalog

**User Story:** As a salon owner, I want to define services with duration, price, and cleanup time, so that bookings reserve the right amount of time and charge the right amount.

#### Acceptance Criteria

1. THE Service_Catalog SHALL store for each Service a name, a duration, a price in Iranian Rial, and a Buffer_Time.
2. WHEN the Scheduling_Engine computes availability for a Service, THE Scheduling_Engine SHALL reserve a continuous interval equal to the Service duration plus the Buffer_Time.
3. IF a Service is defined with a non-positive duration, THEN THE Service_Catalog SHALL reject the Service definition and report the validation error.
4. IF a Service is defined with a negative Buffer_Time or a negative price, THEN THE Service_Catalog SHALL reject the Service definition and report the validation error.

### Requirement 6: Service-to-Staff and Equipment Mapping

**User Story:** As a salon owner, I want to control which staff can perform each service and which chairs have the needed equipment, so that customers are only offered valid combinations.

#### Acceptance Criteria

1. THE Service_Catalog SHALL store the set of Staff_Members who can perform each Service.
2. WHEN a customer selects a Service, THE Scheduling_Engine SHALL consider only Staff_Members mapped to that Service when computing availability.
3. WHERE a Service requires specific equipment, THE Scheduling_Engine SHALL consider only Chairs that provide the required equipment when computing availability.

### Requirement 7: QR-Code Salon Onboarding

**User Story:** As a salon owner, I want printed QR cards that send customers straight to my booking page, so that customers can start booking by scanning a card.

#### Acceptance Criteria

1. WHEN a Salon is created, THE Booking_System SHALL generate a QR payload that encodes a unique identifier for that Salon.
2. WHEN a Customer scans a Salon QR code, THE Booking_System SHALL open the booking entry point for the encoded Salon.
3. WHEN a QR payload is generated for a Salon and then parsed, THE Booking_System SHALL recover the original Salon identifier.
4. IF a scanned QR payload does not correspond to a registered Salon, THEN THE Booking_System SHALL display an unregistered-Salon message and SHALL NOT open a booking entry point.
5. IF a scanned QR payload is malformed or unreadable, THEN THE Booking_System SHALL display a malformed-code message that is distinct from the unregistered-Salon message.

### Requirement 8: Availability and Time-Slot Discovery

**User Story:** As a customer, I want to see the free time slots for a service, so that I can choose a time that works for me.

#### Acceptance Criteria

1. WHEN a customer selects a Service and a date, THE Scheduling_Engine SHALL return only Time_Slots for which at least one qualified Staff_Member and one compatible Chair are both free for the Service duration plus the Buffer_Time.
2. THE Scheduling_Engine SHALL exclude from returned Time_Slots any interval that overlaps an existing Appointment for every otherwise-qualified Staff_Member.
3. THE Scheduling_Engine SHALL exclude from returned Time_Slots any interval that overlaps an existing Appointment for every otherwise-compatible Chair.
4. WHEN no qualified Staff_Member and compatible Chair pair is free on the selected date, THE Scheduling_Engine SHALL return an empty set of Time_Slots.

### Requirement 9: Appointment Booking with the Double-Resource Constraint

**User Story:** As a customer, I want my booking to reserve both a stylist and a chair, so that my appointment is guaranteed to have a person and a place.

#### Acceptance Criteria

1. WHEN a customer confirms a booking for a Service and a Time_Slot, THE Scheduling_Engine SHALL reserve exactly one qualified Staff_Member and exactly one compatible Chair for the entire Service duration plus Buffer_Time.
2. IF no qualified Staff_Member and compatible Chair are simultaneously free for the requested Time_Slot, THEN THE Scheduling_Engine SHALL reject the booking and report no availability.
3. WHILE an Appointment occupies a Staff_Member and a Chair, THE Scheduling_Engine SHALL prevent any other Appointment from reserving that Staff_Member during the overlapping interval.
4. WHILE an Appointment occupies a Staff_Member and a Chair, THE Scheduling_Engine SHALL prevent any other Appointment from reserving that Chair during the overlapping interval.
5. WHEN two booking requests target the last available Staff_Member and Chair pair for an overlapping interval, THE Scheduling_Engine SHALL confirm exactly one Appointment and reject the other.
6. IF a customer attempts to confirm a Time_Slot for which the required Staff_Member or Chair is no longer free, THEN THE Scheduling_Engine SHALL reject the booking and report that the Time_Slot is unavailable.
7. WHEN a booking is confirmed, THE Booking_System SHALL display a success confirmation with the Appointment details to the Customer.

### Requirement 10: Deposit Payments

**User Story:** As a salon owner, I want to require a deposit to hold a slot, so that customers are committed and no-shows are reduced.

#### Acceptance Criteria

1. WHERE a Service is configured to require a deposit, WHEN a customer initiates a booking for that Service, THE Scheduling_Engine SHALL hold the selected Staff_Member and Chair for the Hold_Period pending payment.
2. WHERE a Service is configured to require a deposit, THE Payment_Service SHALL request the deposit through the configured local payment gateway before the Appointment is confirmed.
3. WHEN the payment gateway confirms a deposit payment, THE Booking_System SHALL confirm the Appointment.
4. IF the Hold_Period elapses without a confirmed deposit payment, THEN THE Scheduling_Engine SHALL release the held Staff_Member and the held Chair together in a single atomic operation.
5. THE Payment_Service SHALL record all deposit amounts in Iranian Rial.
6. WHEN a customer submits a deposit payment after the Hold_Period has elapsed, THE Payment_Service SHALL accept the payment request, and THE Scheduling_Engine SHALL re-verify that a qualified Staff_Member and compatible Chair are free before confirming the Appointment.

### Requirement 11: Cancellation and No-Show Handling

**User Story:** As a salon, I want clear cancellation and no-show rules, so that freed time can be rebooked and deposit policy is enforced.

#### Acceptance Criteria

1. WHEN a customer cancels an Appointment, THE Scheduling_Engine SHALL release the reserved Staff_Member and Chair for that Appointment's time window.
2. WHERE a deposit was paid AND a cancellation occurs before the Cancellation_Window, THE Payment_Service SHALL refund the deposit.
3. IF a deposit was paid AND a cancellation occurs within the Cancellation_Window, THEN THE Payment_Service SHALL retain the deposit.
4. WHEN a Staff_Member or Admin marks a confirmed Appointment as a No_Show, THE Booking_System SHALL record the No_Show on the customer profile and release the reserved Staff_Member and Chair.

### Requirement 12: Notifications and Reminders

**User Story:** As a customer, I want confirmations and reminders, so that I do not forget my appointment.

#### Acceptance Criteria

1. WHEN an Appointment is confirmed, THE Notification_Service SHALL send a confirmation message to the Customer.
2. WHEN an Appointment start time is within the Reminder_Lead_Time, THE Notification_Service SHALL send a reminder to the Customer via SMS.
3. WHERE a Customer has enabled push notifications in the mobile app, THE Notification_Service SHALL also deliver the reminder via push notification in addition to the SMS reminder.
4. IF an SMS reminder delivery fails, THEN THE Notification_Service SHALL record the delivery failure and SHALL NOT attempt a further fallback delivery.

### Requirement 13: Walk-Ins and Waitlist

**User Story:** As a receptionist, I want to record walk-ins and offer a waitlist when fully booked, so that in-person demand is captured without double-booking.

#### Acceptance Criteria

1. WHEN a Staff_Member or Admin creates a walk-in Appointment, THE Scheduling_Engine SHALL apply the same double-resource constraint defined for online bookings.
2. WHEN a customer requests a fully booked time window, THE Booking_System SHALL offer to add the customer to the Waitlist for that window.
3. THE Booking_System SHALL maintain the Waitlist for a time window in the order that customers joined.
4. WHEN a Staff_Member and Chair pair becomes free for a waitlisted window, THE Notification_Service SHALL notify the earliest-joined waiting Customer first.

### Requirement 14: Customer Profile and History

**User Story:** As a stylist, I want each customer's history and preferences, so that I can deliver consistent personalized service.

#### Acceptance Criteria

1. THE Booking_System SHALL store each Customer's past Appointments.
2. THE Booking_System SHALL store free-text notes on each Customer profile.
3. WHERE a Customer has a preferred Staff_Member AND that Staff_Member can perform the selected Service AND that Staff_Member is free for the requested Time_Slot, WHEN the Customer starts a booking, THE Booking_System SHALL preselect the preferred Staff_Member.
4. WHERE an account holds the Owner, Admin, or Stylist Role, THE Booking_System SHALL display the customer notes to that account.

### Requirement 15: Admin Calendar Views

**User Story:** As an admin, I want day and week calendar views per chair and per staff, so that I can see and manage the whole schedule.

#### Acceptance Criteria

1. THE Booking_System SHALL display a day view and a week view of Appointments for each Chair.
2. THE Booking_System SHALL display a day view and a week view of Appointments for each Staff_Member.
3. WHEN an Appointment is created, modified, or cancelled through any client, THE Booking_System SHALL reflect the change in the admin calendar views.

### Requirement 16: Utilization and Revenue Analytics

**User Story:** As a salon owner, I want utilization and revenue summaries, so that I can understand how my salon is performing.

#### Acceptance Criteria

1. WHEN an Owner requests analytics for a selected period, THE Analytics_Service SHALL compute Chair utilization as the ratio of booked time to available time over that period.
2. WHEN an Owner requests analytics for a selected period, THE Analytics_Service SHALL compute Staff_Member utilization as the ratio of booked time to available time over that period.
3. WHEN an Owner requests analytics for a selected period, THE Analytics_Service SHALL report a revenue summary in Iranian Rial over that period.
4. WHEN an Owner requests analytics for a selected period, THE Analytics_Service SHALL identify the busiest time windows over that period.

### Requirement 17: Persian Localization and Jalali Calendar

**User Story:** As an Iranian user, I want the app in Persian with the Shamsi calendar, so that it feels native and is easy to use.

#### Acceptance Criteria

1. THE Booking_System SHALL present all user-facing text in Persian.
2. THE Booking_System SHALL render all user-facing screens in right-to-left layout.
3. THE Booking_System SHALL display all dates and times using the Jalali_Calendar.
4. WHEN a Gregorian date is converted to a Jalali_Calendar date and then converted back to a Gregorian date, THE Booking_System SHALL reproduce the original Gregorian date exactly.

### Requirement 18: Platform, Distribution, and Resilience

**User Story:** As a user in Iran, I want a lightweight app that works on local stores and tolerates unstable internet, so that I can rely on it despite connectivity issues.

#### Acceptance Criteria

1. THE Booking_System SHALL provide a PWA accessible through a browser.
2. THE Booking_System SHALL provide a React Native mobile app packaged for distribution through Cafe Bazaar and Myket.
3. IF the network connection is unavailable when a Customer opens the mobile app, THEN THE mobile app SHALL display the most recently cached Appointment information.
4. IF the network connection is unavailable AND no Appointment information has been cached, THEN THE mobile app SHALL display an empty-state indication that no cached data is available.
5. IF a booking submission fails due to a network error, THEN THE Booking_System SHALL preserve the submission and report the failure to the Customer.
