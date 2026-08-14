Feature: Subscription, transaction, and waitlist controller HTTP contracts
  Scenario: exercise money and waitlist routes
    Given I have a controller fixture
    When I exercise controller endpoint "GET /subscription/plans"
    When I exercise controller endpoint "GET /salons/:id/subscription"
    When I exercise controller endpoint "POST /subscription/purchase"
    When I exercise controller endpoint "GET /subscriptions/callback"
    When I exercise controller endpoint "GET /salons/:id/transactions"
    When I exercise controller endpoint "POST /salons/:id/waitlist"
    Then this controller feature should have completed
