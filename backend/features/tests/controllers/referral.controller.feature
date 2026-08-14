Feature: Referral controller HTTP contracts
  Scenario: exercise referral lifecycle routes
    Given I have a controller fixture
    When I exercise controller endpoint "GET /referrals/claim/:token"
    When I exercise controller endpoint "POST /referrals"
    When I exercise controller endpoint "GET /customers/me/referrals"
    When I exercise controller endpoint "GET /salons/:id/referrals"
    When I exercise controller endpoint "POST /referrals/:id/redeem"
    Then this controller feature should have completed
