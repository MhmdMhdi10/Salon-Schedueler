Feature: Payment controller HTTP contracts
  Scenario: exercise payment initiation and callback routes
    Given I have a controller fixture with a held appointment
    When I exercise controller endpoint "POST /payments/initiate"
    When I exercise controller endpoint "POST /payments/callback"
    Then this controller feature should have completed
