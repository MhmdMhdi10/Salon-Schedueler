Feature: Customer, device, and health controller HTTP contracts
  Scenario: exercise customer self-service and device routes
    Given I have a controller fixture
    When I exercise controller endpoint "GET /customers/me/profile"
    When I exercise controller endpoint "PATCH /customers/me/profile"
    When I exercise controller endpoint "GET /customers/me/appointments"
    When I exercise controller endpoint "GET /customers/me/waitlist"
    When I exercise controller endpoint "DELETE /waitlist/:id"
    When I exercise controller endpoint "POST /devices/token"
    When I exercise controller endpoint "GET /healthz"
    Then this controller feature should have completed
