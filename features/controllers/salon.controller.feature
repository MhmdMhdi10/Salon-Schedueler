Feature: Public salon controller HTTP contracts
  Scenario: exercise public salon storefront routes
    Given I have a controller fixture
    When I exercise controller endpoint "GET /salons/by-qr/:payload"
    When I exercise controller endpoint "GET /salons/:id/brand"
    When I exercise controller endpoint "GET /salons/:id/stylists"
    When I exercise controller endpoint "GET /salons/:id/booking-policy"
    When I exercise controller endpoint "GET /salons/:id/services"
    When I exercise controller endpoint "GET /salons/:id/availability"
    When I exercise controller endpoint "POST /salons/:id/scan"
    Then this controller feature should have completed
