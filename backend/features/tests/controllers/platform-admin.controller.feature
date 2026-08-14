Feature: Platform-admin controller HTTP contracts
  Scenario: exercise operations-center routes
    Given I have a controller fixture with an appointment
    When I exercise controller endpoint "GET /platform-admin/dashboard"
    When I exercise controller endpoint "GET /platform-admin/salons"
    When I exercise controller endpoint "GET /platform-admin/salons/:id"
    When I exercise controller endpoint "GET /platform-admin/details/:resource/:id"
    When I exercise controller endpoint "PATCH /platform-admin/salons/:id/status"
    When I exercise controller endpoint "GET /platform-admin/customers"
    When I exercise controller endpoint "GET /platform-admin/staff"
    When I exercise controller endpoint "PATCH /platform-admin/staff/:id/status"
    When I exercise controller endpoint "GET /platform-admin/appointments"
    When I exercise controller endpoint "POST /platform-admin/appointments/:id/action"
    When I exercise controller endpoint "GET /platform-admin/subscriptions"
    When I exercise controller endpoint "GET /platform-admin/payments"
    When I exercise controller endpoint "GET /platform-admin/waitlist"
    When I exercise controller endpoint "GET /platform-admin/qr-scans"
    When I exercise controller endpoint "GET /platform-admin/audit-logs"
    Then this controller feature should have completed
