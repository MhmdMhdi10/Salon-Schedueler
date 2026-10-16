Feature: Deposits and subscription access
  Deposit-required bookings stay on hold until a valid receipt is reviewed by
  salon staff. Subscription status and plan catalogs are available only to
  actors who can manage the salon.

  Background:
    Given I have a running application

  @payments @deposit @happy-path
  Scenario: Customer pays a card-transfer deposit by submitting a receipt that the owner approves
    Given I have a controller fixture with a held appointment
    And I act as actor "customer"
    When I make a "GET" request to "/api/appointments/{{appointmentId}}/deposit"
    Then the response status should be 200
    And response field "deposit.required" should equal "true"
    And response field "deposit.method" should equal "card_transfer"
    When I make a "POST" request to "/api/payments/initiate" with JSON body:
      """
      { "appointmentId": "{{appointmentId}}" }
      """
    Then the response status should be 200
    And response field "deposit.method" should equal "card_transfer"
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/deposit-receipt" with JSON body:
      """
      {
        "fileName": "deposit-proof.jpg",
        "mimeType": "image/jpeg",
        "dataBase64": "/9j/"
      }
      """
    Then the response status should be 201
    And response field "receipt.status" should equal "pending"
    When I make a "GET" request to "/api/appointments/{{appointmentId}}/deposit-receipt"
    Then the response status should be 200
    And response field "receipt.fileName" should equal "deposit-proof.jpg"
    And response field "receipt.dataBase64" should equal "/9j/"
    Given I act as actor "owner"
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/deposit-receipt/review" with JSON body:
      """
      { "decision": "approved", "note": "Transfer details checked." }
      """
    Then the response status should be 200
    And response field "receiptStatus" should equal "approved"
    And response field "appointmentStatus" should equal "confirmed"

  @payments @deposit @validation
  Scenario: Deposit receipt upload rejects missing file metadata
    Given I have a controller fixture with a held appointment
    And I act as actor "customer"
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/deposit-receipt" with JSON body:
      """
      { "fileName": "proof.jpg" }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "mimeType"

  @payments @deposit @authz @security
  Scenario: A different customer cannot read or upload a receipt for another customer's held appointment
    Given I have a controller fixture with a held appointment
    And I create a second customer actor named "otherCustomer"
    And I act as actor "otherCustomer"
    When I make a "GET" request to "/api/appointments/{{appointmentId}}/deposit"
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/deposit-receipt" with JSON body:
      """
      {
        "fileName": "other-customer.jpg",
        "mimeType": "image/jpeg",
        "dataBase64": "/9j/"
      }
      """
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"

  @payments @deposit @authz @security
  Scenario: A customer cannot approve their own deposit receipt
    Given I have a controller fixture with a held appointment
    And I act as actor "customer"
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/deposit-receipt/review" with JSON body:
      """
      { "decision": "approved" }
      """
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"

  @payments @deposit @validation
  Scenario: Receipt review accepts only an approved or rejected decision
    Given I have a controller fixture with a held appointment
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/deposit-receipt/review" with JSON body:
      """
      { "decision": "pending" }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "decision"

  @subscriptions @happy-path
  Scenario: Salon owner can view purchasable plans and the current salon subscription
    Given I have a controller fixture
    When I make a "GET" request to "/api/subscription/plans"
    Then the response status should be 200
    And response array "plans" should contain at least 2 items
    And response array "plans" should contain item with field "kind" equal to "monthly"
    When I make a "GET" request to "/api/salons/{{salonId}}/subscription"
    Then the response status should be 200
    And the response should contain the field "status"
    And the response should contain the field "planKind"
    And the response should contain the field "expiresAt"

  @subscriptions @validation
  Scenario: Salon owner cannot purchase an unsupported subscription plan
    Given I have a controller fixture
    When I make a "POST" request to "/api/subscription/purchase" with JSON body:
      """
      { "salonId": "{{salonId}}", "plan": "annual" }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "plan"

  @subscriptions @authz @security
  Scenario: A customer cannot inspect or purchase the salon subscription
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "GET" request to "/api/salons/{{salonId}}/subscription"
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"
    When I make a "POST" request to "/api/subscription/purchase" with JSON body:
      """
      { "salonId": "{{salonId}}", "plan": "monthly" }
      """
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"
