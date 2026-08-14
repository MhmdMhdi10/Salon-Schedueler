Feature: Bot and card-order controller HTTP contracts
  Scenario: exercise bot and printed-card routes
    Given I have a controller fixture
    When I exercise controller endpoint "POST /bots/telegram/:secret"
    When I exercise controller endpoint "POST /bots/bale/:secret"
    When I exercise controller endpoint "POST /salons/:id/card-orders"
    Then this controller feature should have completed
