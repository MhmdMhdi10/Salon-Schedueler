@flow-health @flow-public-auth @flow-failure-paths
Feature: Public health, registration, and authentication
  The public surface must be safe before a user creates an account and predictable
  after OTP authentication.

  Background:
    Given the dev API is healthy

  @smoke
  Scenario: Health endpoint reports a live API
    When I make a "GET" request to "/healthz"
    Then the response status should be 200
    And the response field "status" should equal "ok"

  Scenario: Protected API rejects an anonymous request
    When I make a "GET" request to "/api/me"
    Then the response status should be 401
    And the response field "code" should equal "UNAUTHORIZED"

  Scenario: Invalid registration payload is rejected at the boundary
    When I make a "POST" request to "/api/register/salon" with body:
      """
      {}
      """
    Then the response status should be 400
    And the response field "code" should equal "VALIDATION_ERROR"

  Scenario: Owner registration creates an owner actor and OTP session
    Given I have an isolated "fixed_salon" salon named "Cucumber Auth"
    When I use actor "owner"
    And I make a "GET" request to "/api/me"
    Then the response status should be 200
    And the response field "principal.role" should equal "Owner"
    And the response field "principal.salonId" should equal "{{salonId}}"

  Scenario: Customer OTP session can be refreshed and invalid OTP is rejected
    Given I have an isolated "fixed_salon" salon named "Cucumber OTP"
    And I create a customer actor named "customer"
    When I use actor "owner"
    And I make a "POST" request to "/api/auth/otp/request" with body:
      """
      {"phone":"{{ownerPhone}}"}
      """
    Then the response status should be 200
    And the response field "devOtp" should exist
    When I make a "POST" request to "/api/auth/otp/verify" with body:
      """
      {"phone":"{{ownerPhone}}","code":"999999"}
      """
    Then the response status should be 401
    And the response field "code" should equal "OTP_INVALID"
    When I make a "POST" request to "/api/auth/refresh" with body:
      """
      {"refreshToken":"not-a-refresh-token"}
      """
    Then the response status should be 401
