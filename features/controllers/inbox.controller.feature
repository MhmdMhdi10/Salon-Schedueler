Feature: Inbox controller HTTP contracts
  Scenario: exercise notification routes
    Given I have a controller fixture
    When I exercise controller endpoint "GET /salons/:id/notifications"
    When I exercise controller endpoint "GET /salons/:id/notifications/unread-count"
    When I exercise controller endpoint "PATCH /notifications/:id/read"
    When I exercise controller endpoint "POST /salons/:id/notifications/read-all"
    Then this controller feature should have completed
