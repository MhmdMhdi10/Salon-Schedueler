Feature: Customer self-service, notifications, and support
  Customer APIs use the signed-in customer identity for profile data, booking
  history, waitlist entries, notification preferences, device tokens, and help
  tickets.

  Background:
    Given I have a running application

  @customer @profile @happy-path
  Scenario: A customer updates their profile and reads the saved name back
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "PATCH" request to "/api/customers/me/profile" with JSON body:
      """
      { "fullName": "Nazanin Customer" }
      """
    Then the response status should be 200
    And response field "customer.fullName" should equal "Nazanin Customer"
    When I make a "GET" request to "/api/customers/me/profile"
    Then the response status should be 200
    And response field "customer.fullName" should equal "Nazanin Customer"
    And the response should contain the field "customer.phone"

  @customer @profile @validation
  Scenario: Customer profile rejects names that are too short or too long
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "PATCH" request to "/api/customers/me/profile" with JSON body:
      """
      { "fullName": "A" }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "fullName"
    When I make a "PATCH" request to "/api/customers/me/profile" with JSON body:
      """
      { "fullName": "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN" }
      """
    Then the response status should be 400
    And response field "field" should equal "fullName"

  @customer @authz @security
  Scenario: Anonymous visitors cannot read customer profile or appointment history
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/customers/me/profile"
    Then the response status should be 401
    And response field "code" should equal "UNAUTHORIZED"
    When I make a "GET" request to "/api/customers/me/appointments"
    Then the response status should be 401
    And response field "code" should equal "UNAUTHORIZED"

  @customer @notifications @happy-path
  Scenario: A customer can read their notifications and acknowledge all unseen items
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "GET" request to "/api/customers/me/notifications"
    Then the response status should be 200
    And response array "notifications" should contain at least 0 items
    When I make a "POST" request to "/api/customers/me/notifications/read-all" with JSON body:
      """
      {}
      """
    Then the response status should be 200
    And the response should contain the field "count"

  @customer @waitlist @happy-path
  Scenario: A customer joins the waitlist, sees the entry, and cancels it
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/salons/{{salonId}}/waitlist" with JSON body:
      """
      {
        "serviceId": "{{serviceId}}",
        "windowStart": "{{date}}T09:00:00.000Z",
        "windowEnd": "{{date}}T10:00:00.000Z"
      }
      """
    Then the response status should be 201
    And response field "waitlist.status" should equal "waiting"
    And I save response field "waitlist.id" as "waitlistId"
    When I make a "GET" request to "/api/customers/me/waitlist"
    Then the response status should be 200
    And response array "waitlist" should contain item with field "id" equal to "{{waitlistId}}"
    When I make a "DELETE" request to "/api/waitlist/{{waitlistId}}"
    Then the response status should be 200
    And response field "waitlist.status" should equal "cancelled"

  @customer @waitlist @authz @security
  Scenario: A customer cannot cancel another customer's waitlist entry
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/salons/{{salonId}}/waitlist" with JSON body:
      """
      {
        "serviceId": "{{serviceId}}",
        "windowStart": "{{date}}T10:00:00.000Z",
        "windowEnd": "{{date}}T11:00:00.000Z"
      }
      """
    Then the response status should be 201
    And I save response field "waitlist.id" as "waitlistId"
    Given I create a second customer actor named "otherCustomer"
    And I act as actor "otherCustomer"
    When I make a "DELETE" request to "/api/waitlist/{{waitlistId}}"
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"

  @customer @waitlist @validation
  Scenario: A waitlist request rejects an empty service identifier
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/salons/{{salonId}}/waitlist" with JSON body:
      """
      {
        "windowStart": "{{date}}T10:00:00.000Z",
        "windowEnd": "{{date}}T11:00:00.000Z"
      }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "serviceId"

  @customer @devices @happy-path
  Scenario: A customer registers a push device token after signing in
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/devices/token" with JSON body:
      """
      { "token": "bdd-device-token-2026", "platform": "web" }
      """
    Then the response status should be 200
    And response field "ok" should equal "true"

  @customer @devices @validation
  Scenario: Device registration requires both a push token and a platform
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/devices/token" with JSON body:
      """
      { "token": "" }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"

  @customer @support @happy-path
  Scenario: A customer submits a support ticket and sees it in their own ticket list
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/support/tickets" with JSON body:
      """
      {
        "page": "/booking/confirm",
        "action": "submit-booking",
        "message": "The booking confirmation page did not show my note.",
        "errorCode": "BOOKING_CONFIRMATION_DISPLAY",
        "browser": "Cucumber Browser",
        "device": "Desktop"
      }
      """
    Then the response status should be 201
    And response field "ticket.reporterRole" should equal "Customer"
    And response field "ticket.message" should equal "The booking confirmation page did not show my note."
    And I save response field "ticket.id" as "supportTicketId"
    When I make a "GET" request to "/api/support/tickets/mine"
    Then the response status should be 200
    And response array "tickets" should contain item with field "id" equal to "{{supportTicketId}}"

  @customer @support @validation
  Scenario: A support ticket must include a useful message and a supported screenshot
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/support/tickets" with JSON body:
      """
      { "message": "Help" }
      """
    Then the response status should be 400
    And response field "field" should equal "message"
    When I make a "POST" request to "/api/support/tickets" with JSON body:
      """
      {
        "message": "A longer report with an unsupported screenshot format.",
        "screenshot": {
          "name": "capture.gif",
          "mime": "image/gif",
          "dataBase64": "R0lGODlhAQABAIAAAAUEBA=="
        }
      }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "screenshot.mime"
