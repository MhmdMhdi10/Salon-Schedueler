Feature: Payment controller HTTP contracts
  Scenario: exercise payment initiation and callback routes
    Given I have a controller fixture with a held appointment
    When I exercise controller endpoint "GET /appointments/:id/deposit"
    When I exercise controller endpoint "POST /payments/initiate"
    When I exercise controller endpoint "GET /payments/callback"
    When I exercise controller endpoint "POST /appointments/:id/deposit-receipt"
    When I exercise controller endpoint "GET /appointments/:id/deposit-receipt"
    When I exercise controller endpoint "POST /appointments/:id/deposit-receipt/review"
    When I exercise controller endpoint "POST /payments/callback"
    Then this controller feature should have completed
