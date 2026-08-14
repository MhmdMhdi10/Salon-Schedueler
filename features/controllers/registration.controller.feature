Feature: Registration controller HTTP contracts
  Scenario: exercise salon registration routes
    Given I have a controller fixture
    When I exercise controller endpoint "POST /register/salon"
    When I exercise controller endpoint "GET /register/check-phone"
    Then this controller feature should have completed
