Feature: Public salon discovery and booking availability
  A visitor can browse a salon storefront without an account, inspect its
  services and booking rules, find bookable slots, and receive clear errors for
  invalid public inputs.

  Background:
    Given I have a running application

  @public @storefront
  Scenario: An anonymous visitor can load the salon brand, services, stylists, and booking policy
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/{{salonId}}/brand"
    Then the response status should be 200
    And response field "name" should equal "{{salonName}}"
    When I make a "GET" request to "/api/salons/{{salonId}}/services"
    Then the response status should be 200
    And response array "services" should contain at least 1 items
    And response array "services" should contain item with field "id" equal to "{{serviceId}}"
    When I make a "GET" request to "/api/salons/{{salonId}}/stylists"
    Then the response status should be 200
    And response array "stylists" should contain at least 1 items
    When I make a "GET" request to "/api/salons/{{salonId}}/booking-policy"
    Then the response status should be 200
    And the response should contain the field "bookingWindowDays"
    And the response should contain the field "locationTypes"

  @public @availability @happy-path
  Scenario: A visitor can retrieve available slots for a listed service
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/{{salonId}}/availability?serviceId={{serviceId}}&date={{date}}&locationType=salon"
    Then the response status should be 200
    And response array "slots" should contain at least 1 items
    And the response should contain the field "slots.0.startAt"
    And the response should contain the field "slots.0.endAt"

  @public @availability @validation
  Scenario: Availability requires both a date and a service identifier
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/{{salonId}}/availability?serviceId={{serviceId}}"
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "query.date"
    When I make a "GET" request to "/api/salons/{{salonId}}/availability?date={{date}}"
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "query.serviceId"

  @public @availability @validation
  Scenario: Availability rejects an unsupported service location
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/{{salonId}}/availability?serviceId={{serviceId}}&date={{date}}&locationType=remote"
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "query.locationType"

  @public @qr @validation
  Scenario: A malformed salon QR payload is reported with the malformed-payload error
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/by-qr/not-a-valid-payload"
    Then the response status should be 400
    And response field "code" should equal "QR_MALFORMED"
