Feature: Platform administration boundary
  Platform operations are restricted to an authenticated platform administrator,
  and malformed resource identifiers are rejected before database access.

  Background:
    Given I have a running application

  @platform-admin @authz @security
  Scenario: Salon owners and customers cannot enter platform administration
    Given I have a controller fixture
    When I make a "GET" request to "/api/platform-admin/dashboard"
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"
    Given I act as actor "customer"
    When I make a "GET" request to "/api/platform-admin/salons?page=1&limit=5"
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"

  @platform-admin @happy-path
  Scenario: A platform administrator can load the global dashboard and salon directory
    Given I have a controller fixture
    And I act as actor "platform"
    When I make a "GET" request to "/api/platform-admin/dashboard"
    Then the response status should be 200
    And the response should contain the field "metrics.totalSalons"
    And the response should contain the field "metrics.totalCustomers"
    When I make a "GET" request to "/api/platform-admin/salons?page=1&limit=5"
    Then the response status should be 200
    And response array "data" should contain at least 1 items
    And the response should contain the field "meta"

  @platform-admin @validation
  Scenario: Platform salon details reject a malformed resource identifier
    Given I have a controller fixture
    And I act as actor "platform"
    When I make a "GET" request to "/api/platform-admin/salons/not-a-uuid"
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "id"

  @platform-admin @validation
  Scenario: Platform salon creation reports the missing required field
    Given I have a controller fixture
    And I act as actor "platform"
    When I make a "POST" request to "/api/platform-admin/salons" with JSON body:
      """
      { "ownerName": "Platform Owner", "phone": "09123334456" }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "salonName"
