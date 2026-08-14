Feature: Auth controller HTTP contracts
  Scenario: exercise OTP and token routes
    Given I have a controller fixture
    When I exercise controller endpoint "POST /auth/otp/request"
    When I exercise controller endpoint "POST /auth/otp/verify"
    When I exercise controller endpoint "POST /auth/refresh"
    When I exercise controller endpoint "POST /auth/logout"
    Then this controller feature should have completed
