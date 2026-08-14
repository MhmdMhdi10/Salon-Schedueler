Feature: QR controller HTTP contracts
  Scenario: exercise owner and stylist QR routes
    Given I have a controller fixture
    When I exercise controller endpoint "GET /salons/:id/qr"
    When I exercise controller endpoint "GET /salons/:id/staff/:staffId/qr"
    Then this controller feature should have completed
