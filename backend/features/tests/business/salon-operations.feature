Feature: Salon configuration and staff access control
  Salon owners and administrators can configure services, booking policies,
  and working hours. Public booking data reflects saved settings, while staff
  members without management permission cannot change salon configuration.

  Background:
    Given I have a running application

  @salon @booking-policy @happy-path
  Scenario: Owner changes the booking window and visitors see the new public policy
    Given I have a controller fixture
    When I make a "PUT" request to "/api/salons/{{salonId}}/booking-policy" with JSON body:
      """
      {
        "bookingWindowDays": 21,
        "bookingStartOffsetDays": 0,
        "workMode": "fixed_salon"
      }
      """
    Then the response status should be 200
    And response field "ok" should equal "true"
    And response field "bookingWindowDays" should equal "21"
    When I act as actor "anonymous"
    And I make a "GET" request to "/api/salons/{{salonId}}/booking-policy"
    Then the response status should be 200
    And response field "bookingWindowDays" should equal "21"
    And response field "workMode" should equal "fixed_salon"

  @salon @booking-policy @validation
  Scenario: Owner cannot save a booking horizon outside the supported range
    Given I have a controller fixture
    When I make a "PUT" request to "/api/salons/{{salonId}}/booking-policy" with JSON body:
      """
      { "bookingWindowDays": 366 }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "bookingWindowDays"

  @salon @booking-policy @authz @security
  Scenario: A stylist cannot change the salon booking policy
    Given I have a controller fixture
    And I act as actor "stylist"
    When I make a "PUT" request to "/api/salons/{{salonId}}/booking-policy" with JSON body:
      """
      { "bookingWindowDays": 30 }
      """
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"

  @salon @services @happy-path
  Scenario: Owner publishes a new service and anonymous visitors can find it
    Given I have a controller fixture
    When I make a "POST" request to "/api/salons/{{salonId}}/services" with JSON body:
      """
      {
        "name": "BDD Color Consultation",
        "durationMinutes": 45,
        "bufferMinutes": 10,
        "priceRial": 1250000
      }
      """
    Then the response status should be 201
    And response field "service.name" should equal "BDD Color Consultation"
    And I save response field "service.id" as "newServiceId"
    Given I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/{{salonId}}/services"
    Then the response status should be 200
    And response array "services" should contain item with field "id" equal to "{{newServiceId}}"
    And response array "services" should contain item with field "name" equal to "BDD Color Consultation"

  @salon @services @authz @security
  Scenario: A stylist cannot add or remove services from the salon catalog
    Given I have a controller fixture
    And I act as actor "stylist"
    When I make a "POST" request to "/api/salons/{{salonId}}/services" with JSON body:
      """
      {
        "name": "Unauthorized Stylist Service",
        "durationMinutes": 30,
        "priceRial": 250000
      }
      """
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"

  @salon @working-hours @happy-path
  Scenario: Owner saves a recurring schedule with separate opening intervals
    Given I have a controller fixture
    When I make a "PUT" request to "/api/salons/{{salonId}}/working-hours" with JSON body:
      """
      {
        "hours": [
          { "weekday": 1, "startTime": "09:00", "endTime": "13:00" },
          { "weekday": 1, "startTime": "14:00", "endTime": "19:00" },
          { "weekday": 2, "startTime": "10:00", "endTime": "18:00" }
        ]
      }
      """
    Then the response status should be 200
    And response field "ok" should equal "true"
    And response array "hours" should contain at least 3 items
    When I make a "GET" request to "/api/salons/{{salonId}}/working-hours"
    Then the response status should be 200
    And response array "hours" should contain item with field "startTime" equal to "09:00"

  @salon @working-hours @validation
  Scenario: Owner cannot save overlapping or reversed working intervals
    Given I have a controller fixture
    When I make a "PUT" request to "/api/salons/{{salonId}}/working-hours" with JSON body:
      """
      {
        "hours": [
          { "weekday": 1, "startTime": "09:00", "endTime": "14:00" },
          { "weekday": 1, "startTime": "13:00", "endTime": "18:00" }
        ]
      }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "hours"
    When I make a "PUT" request to "/api/salons/{{salonId}}/working-hours" with JSON body:
      """
      {
        "hours": [
          { "weekday": 8, "startTime": "18:00", "endTime": "09:00" }
        ]
      }
      """
    Then the response status should be 400
    And response field "field" should equal "hours"

  @salon @calendar @authz
  Scenario: An owner sees their salon appointments while a stylist sees only their calendar
    Given I have a controller fixture with an appointment
    When I make a "GET" request to "/api/salons/{{salonId}}/calendar?from={{date}}&to={{futureDate}}"
    Then the response status should be 200
    And response array "appointments" should contain item with field "id" equal to "{{appointmentId}}"
    Given I act as actor "stylist"
    When I make a "GET" request to "/api/salons/{{salonId}}/calendar?from={{date}}&to={{futureDate}}"
    Then the response status should be 200
    And the response should contain the field "appointments"

  @salon @inbox @happy-path
  Scenario: Owner can inspect salon inbox notifications and unread count
    Given I have a controller fixture with an appointment
    When I make a "GET" request to "/api/salons/{{salonId}}/notifications?onlyUnread=true&limit=20&offset=0"
    Then the response status should be 200
    And the response should contain the field "notifications"
    And the response should contain the field "total"
    When I make a "GET" request to "/api/salons/{{salonId}}/notifications/unread-count"
    Then the response status should be 200
    And the response should contain the field "count"
