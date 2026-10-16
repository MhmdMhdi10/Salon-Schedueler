Feature: Customer salon referrals
  Customers can submit salon referrals, review the claim invitation, and see
  their own referrals. Salon staff cannot create referrals on behalf of a
  customer account.

  Background:
    Given I have a running application

  @referrals @happy-path
  Scenario: Customer submits a referral and can review its invitation and status
    Given I have a controller fixture
    And I have a fresh test phone stored as "referredSalonPhone"
    And I act as actor "customer"
    When I make a "POST" request to "/api/referrals" with JSON body:
      """
      {
        "salonName": "BDD Referred Studio",
        "city": "Tehran",
        "salonPhone": "{{referredSalonPhone}}",
        "salonInstagram": "bdd.referred.studio"
      }
      """
    Then the response status should be 201
    And response field "referral.salonName" should equal "BDD Referred Studio"
    And response field "referral.status" should equal "submitted"
    And I save response field "referral.id" as "referralId"
    And I save response field "referral.claimToken" as "referralToken"
    When I make a "GET" request to "/api/referrals/claim/{{referralToken}}"
    Then the response status should be 200
    And response field "referral.salonName" should equal "BDD Referred Studio"
    And response field "referral.requiredBookings" should equal "3"
    When I make a "GET" request to "/api/customers/me/referrals"
    Then the response status should be 200
    And response array "referrals" should contain item with field "id" equal to "{{referralId}}"

  @referrals @authz @security
  Scenario: Salon staff cannot submit a referral as if they were a customer
    Given I have a controller fixture
    When I make a "POST" request to "/api/referrals" with JSON body:
      """
      {
        "salonName": "Unauthorized Staff Referral",
        "city": "Tehran",
        "salonPhone": "09123334445"
      }
      """
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"

  @referrals @validation
  Scenario: A referral must contain a salon name and at least one contact channel
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/referrals" with JSON body:
      """
      {
        "salonName": "",
        "city": "Tehran"
      }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
