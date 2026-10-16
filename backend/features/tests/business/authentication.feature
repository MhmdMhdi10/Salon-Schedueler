Feature: Authentication and session lifecycle
  The API issues short-lived access tokens only after a valid OTP, rotates refresh
  sessions once, and scopes staff access to verified salon memberships.

  Background:
    Given I have a running application

  @auth @validation
  Scenario: OTP request and verification require their mandatory fields
    When I make a "POST" request to "/api/auth/otp/request" with JSON body:
      """
      {}
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    When I make a "POST" request to "/api/auth/otp/verify" with JSON body:
      """
      { "phone": "09120000001" }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"

  @auth @security
  Scenario: Five incorrect OTP guesses invalidate the challenge
    Given I have a fresh test phone stored as "otpPhone"
    When I make a "POST" request to "/api/auth/otp/request" with JSON body:
      """
      { "phone": "{{otpPhone}}" }
      """
    Then the response status should be 200
    And I save response field "devOtp" as "otpCode"
    When I verify the latest OTP incorrectly 5 times
    Then the response status should be 401
    And response field "code" should equal "OTP_INVALID"
    When I make a "POST" request to "/api/auth/otp/verify" with JSON body:
      """
      { "phone": "{{otpPhone}}", "code": "{{otpCode}}" }
      """
    Then the response status should be 401
    And response field "code" should equal "OTP_INVALID"

  @auth @happy-path
  Scenario: A verified customer rotates and revokes a refresh session
    Given I have a fresh test phone stored as "otpPhone"
    When I make a "POST" request to "/api/auth/otp/request" with JSON body:
      """
      { "phone": "{{otpPhone}}" }
      """
    Then the response status should be 200
    And I save response field "devOtp" as "otpCode"
    When I make a "POST" request to "/api/auth/otp/verify" with JSON body:
      """
      { "phone": "{{otpPhone}}", "code": "{{otpCode}}" }
      """
    Then the response status should be 200
    And the response should contain the field "accessToken"
    And I save response field "refreshToken" as "oldRefreshToken"
    When I make a "POST" request to "/api/auth/refresh" with JSON body:
      """
      { "refreshToken": "{{oldRefreshToken}}" }
      """
    Then the response status should be 200
    And the response should contain the field "accessToken"
    And response field "refreshToken" should not equal "{{oldRefreshToken}}"
    And I save response field "refreshToken" as "currentRefreshToken"
    When I set the request header "X-Auth-Client" to "mobile"
    And I make a "POST" request to "/api/auth/logout" with JSON body:
      """
      { "refreshToken": "{{currentRefreshToken}}" }
      """
    Then the response status should be 204
    When I make a "POST" request to "/api/auth/refresh" with JSON body:
      """
      { "refreshToken": "{{currentRefreshToken}}" }
      """
    Then the response status should be 401
    And response field "code" should equal "INVALID_TOKEN"

  @auth @validation
  Scenario: Browser refresh without a cookie stays anonymous while mobile must send a token
    Given I act as actor "anonymous"
    When I set the request header "X-Auth-Client" to "web"
    And I make a "POST" request to "/api/auth/refresh"
    Then the response status should be 204
    When I set the request header "X-Auth-Client" to "mobile"
    And I make a "POST" request to "/api/auth/refresh" with JSON body:
      """
      {}
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"

  @auth @authz
  Scenario: Staff contexts are private and list only the authenticated owner's memberships
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/auth/contexts"
    Then the response status should be 401
    And response field "code" should equal "UNAUTHORIZED"
    Given I act as actor "owner"
    When I make a "GET" request to "/api/auth/contexts"
    Then the response status should be 200
    And response array "staffContexts" should contain at least 1 items
    And response array "staffContexts" should contain item with field "role" equal to "Owner"
    And response array "staffContexts" should contain item with field "salonId" equal to "{{salonId}}"

  @auth @happy-path
  Scenario: An owner can select a staff context belonging to their verified phone
    Given I have a controller fixture
    When I make a "GET" request to "/api/auth/contexts"
    Then the response status should be 200
    And I save response field "staffContexts.0.staffMemberId" as "staffContextId"
    When I set the request header "X-Auth-Client" to "mobile"
    And I make a "POST" request to "/api/auth/context" with JSON body:
      """
      { "staffMemberId": "{{staffContextId}}" }
      """
    Then the response status should be 200
    And the response should contain the field "accessToken"
    And response array "staffContexts" should contain item with field "salonId" equal to "{{salonId}}"

  @auth @authz
  Scenario: A customer cannot select a staff context that is not theirs
    Given I have a controller fixture
    And I act as actor "customer"
    When I set the request header "X-Auth-Client" to "mobile"
    And I make a "POST" request to "/api/auth/context" with JSON body:
      """
      { "staffMemberId": "00000000-0000-4000-8000-000000000000" }
      """
    Then the response status should be 401
    And response field "code" should equal "INVALID_TOKEN"
