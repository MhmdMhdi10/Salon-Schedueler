Feature: Salon owner registration
  A salon is created only for an OTP-verified phone, and the new membership is
  available to the owner after signing in again.

  Background:
    Given I have a running application

  @registration @happy-path
  Scenario: A verified customer registers a salon with its initial service and chair
    Given I have a controller fixture
    And I create a second customer actor named "applicant"
    And I act as actor "applicant"
    When I make a "POST" request to "/api/register/salon" with JSON body:
      """
      {
        "salonName": "BDD New Salon",
        "ownerName": "BDD Owner",
        "phone": "{{applicantPhone}}",
        "businessType": "hair",
        "workMode": "fixed_salon",
        "chairCount": 1,
        "services": [
          { "name": "BDD Haircut", "durationMinutes": 45, "priceRial": 750000 }
        ]
      }
      """
    Then the response status should be 201
    And the response should contain the field "salonId"
    And response field "salonName" should equal "BDD New Salon"
    And I save response field "salonId" as "newSalonId"
    Given I re-authenticate as actor "applicant"
    When I make a "GET" request to "/api/auth/contexts"
    Then the response status should be 200
    And response array "staffContexts" should contain item with field "role" equal to "Owner"
    And response array "staffContexts" should contain item with field "salonId" equal to "{{newSalonId}}"
    When I make a "GET" request to "/api/salons/{{newSalonId}}/services"
    Then the response status should be 200
    And response array "services" should contain item with field "name" equal to "BDD Haircut"

  @registration @authz
  Scenario: Anonymous requests cannot create a salon
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "POST" request to "/api/register/salon" with JSON body:
      """
      {
        "salonName": "Anonymous Salon",
        "ownerName": "Anonymous Owner",
        "phone": "{{ownerPhone}}",
        "businessType": "hair",
        "workMode": "fixed_salon",
        "chairCount": 1
      }
      """
    Then the response status should be 401
    And response field "code" should equal "UNAUTHORIZED"

  @registration @authz
  Scenario: A verified account cannot register with a different phone number
    Given I have a controller fixture
    And I create a second customer actor named "applicant"
    And I act as actor "applicant"
    When I make a "POST" request to "/api/register/salon" with JSON body:
      """
      {
        "salonName": "Phone Mismatch Salon",
        "ownerName": "Phone Mismatch Owner",
        "phone": "{{ownerPhone}}",
        "businessType": "hair",
        "workMode": "fixed_salon",
        "chairCount": 1
      }
      """
    Then the response status should be 403
    And response field "code" should equal "PHONE_VERIFICATION_REQUIRED"

  @registration @validation
  Scenario: Invalid registration payloads identify the first required field
    Given I have a controller fixture
    When I make a "POST" request to "/api/register/salon" with JSON body:
      """
      {}
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "salonName"

  @registration @security
  Scenario: Honeypot submissions are rejected before salon creation
    Given I have a controller fixture
    When I make a "POST" request to "/api/register/salon" with JSON body:
      """
      {
        "salonName": "Automated Salon",
        "ownerName": "Automated Owner",
        "phone": "{{ownerPhone}}",
        "businessType": "hair",
        "workMode": "fixed_salon",
        "chairCount": 1,
        "website": "https://spam.example"
      }
      """
    Then the response status should be 403
    And response field "code" should equal "AUTOMATION_BLOCKED"

  @registration @happy-path
  Scenario: Phone preflight rejects an existing member and allows a fresh phone
    Given I have a controller fixture
    And I have a fresh test phone stored as "freshPhone"
    When I make a "GET" request to "/api/register/check-phone?phone={{ownerPhone}}"
    Then the response status should be 200
    And response field "available" should equal "false"
    When I make a "GET" request to "/api/register/check-phone?phone={{freshPhone}}"
    Then the response status should be 200
    And response field "available" should equal "true"

  @registration @conflict
  Scenario: The same verified owner cannot register a second salon
    Given I have a controller fixture
    When I make a "POST" request to "/api/register/salon" with JSON body:
      """
      {
        "salonName": "Duplicate Owner Salon",
        "ownerName": "Duplicate Owner",
        "phone": "{{ownerPhone}}",
        "businessType": "hair",
        "workMode": "fixed_salon",
        "chairCount": 1
      }
      """
    Then the response status should be 409
    And response field "code" should equal "PHONE_TAKEN"
