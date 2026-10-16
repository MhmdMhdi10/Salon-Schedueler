Feature: Customer booking and appointment lifecycle
  A customer books only an available service slot, salon staff approve or reject
  pending requests, and the booking owner controls customer cancellation.

  Background:
    Given I have a running application

  @booking @happy-path
  Scenario: A customer books a service and sees the pending appointment in their history
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/{{salonId}}/availability?serviceId={{serviceId}}&date={{date}}&locationType=salon"
    Then the response status should be 200
    And I save response field "slots.0.startAt" as "bookingStartAt"
    Given I act as actor "customer"
    When I make a "POST" request to "/api/appointments" with JSON body:
      """
      {
        "salonId": "{{salonId}}",
        "serviceId": "{{serviceId}}",
        "startAt": "{{bookingStartAt}}",
        "locationType": "salon",
        "customerNote": "Please use a fragrance-free product."
      }
      """
    Then the response status should be 200
    And response field "status" should equal "pending"
    And response field "appointment.status" should equal "pending"
    And response field "appointment.customerNote" should equal "Please use a fragrance-free product."
    And I save response field "appointment.id" as "newAppointmentId"
    When I make a "GET" request to "/api/customers/me/appointments"
    Then the response status should be 200
    And response array "appointments" should contain item with field "id" equal to "{{newAppointmentId}}"

  @booking @approval @happy-path
  Scenario: Salon owner approves a pending appointment and customer history reflects confirmation
    Given I have a controller fixture with an appointment
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/approve" with JSON body:
      """
      {}
      """
    Then the response status should be 200
    And response field "status" should equal "confirmed"
    And response field "appointment.status" should equal "confirmed"
    Given I act as actor "customer"
    When I make a "GET" request to "/api/customers/me/appointments"
    Then the response status should be 200
    And response array "appointments" should contain item with field "status" equal to "confirmed"

  @booking @approval @happy-path
  Scenario: Salon owner rejects a pending appointment and records a customer-facing reason
    Given I have a controller fixture with an appointment
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/reject" with JSON body:
      """
      { "reason": "The selected stylist is unavailable at that time." }
      """
    Then the response status should be 200
    And response field "status" should equal "cancelled"
    And response field "appointment.status" should equal "cancelled"

  @booking @cancellation @happy-path
  Scenario: A customer cancels their own appointment and can read its cancellation record
    Given I have a controller fixture with an appointment
    And I act as actor "customer"
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/cancel" with JSON body:
      """
      { "reason": "My plans have changed." }
      """
    Then the response status should be 200
    And response field "status" should equal "cancelled"
    When I make a "GET" request to "/api/appointments/{{appointmentId}}/cancellation"
    Then the response status should be 200
    And the response should contain the field "cancellation"

  @booking @authz @security
  Scenario: A different customer cannot cancel another customer's appointment
    Given I have a controller fixture with an appointment
    And I create a second customer actor named "otherCustomer"
    And I act as actor "otherCustomer"
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/cancel" with JSON body:
      """
      { "reason": "Attempted cancellation by another account." }
      """
    Then the response status should be 403
    And response field "code" should equal "FORBIDDEN"

  @booking @validation
  Scenario: A booking request must include its salon and service identifiers
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/appointments" with JSON body:
      """
      {}
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "salonId"
    When I make a "POST" request to "/api/appointments" with JSON body:
      """
      {
        "salonId": "{{salonId}}",
        "startAt": "{{date}}T09:00:00.000Z"
      }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "serviceId"

  @booking @validation
  Scenario: A customer-location appointment requires a non-empty service address
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/appointments" with JSON body:
      """
      {
        "salonId": "{{salonId}}",
        "serviceId": "{{serviceId}}",
        "startAt": "{{date}}T09:00:00.000Z",
        "locationType": "customer",
        "locationAddress": "   "
      }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "locationAddress"

  @booking @validation
  Scenario: A booking rejects invalid duration overrides and unknown location types
    Given I have a controller fixture
    And I act as actor "customer"
    When I make a "POST" request to "/api/appointments" with JSON body:
      """
      {
        "salonId": "{{salonId}}",
        "serviceId": "{{serviceId}}",
        "startAt": "{{date}}T09:00:00.000Z",
        "durationMinutes": 4
      }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "durationMinutes"
    When I make a "POST" request to "/api/appointments" with JSON body:
      """
      {
        "salonId": "{{salonId}}",
        "serviceId": "{{serviceId}}",
        "startAt": "{{date}}T09:00:00.000Z",
        "locationType": "remote"
      }
      """
    Then the response status should be 400
    And response field "code" should equal "VALIDATION_ERROR"
    And response field "field" should equal "locationType"

  @booking @security
  Scenario: A booking bot honeypot is rejected without creating a reservation
    Given I have a controller fixture
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/{{salonId}}/availability?serviceId={{serviceId}}&date={{date}}&locationType=salon"
    Then the response status should be 200
    And I save response field "slots.0.startAt" as "bookingStartAt"
    Given I act as actor "customer"
    When I make a "POST" request to "/api/appointments" with JSON body:
      """
      {
        "salonId": "{{salonId}}",
        "serviceId": "{{serviceId}}",
        "startAt": "{{bookingStartAt}}",
        "locationType": "salon",
        "website": "https://automated.example"
      }
      """
    Then the response status should be 403
    And response field "code" should equal "AUTOMATION_BLOCKED"

  @booking @capacity @happy-path
  Scenario: A second customer can reserve another available slot after the owner approves the first
    Given I have a controller fixture with an appointment
    When I make a "POST" request to "/api/appointments/{{appointmentId}}/approve" with JSON body:
      """
      {}
      """
    Then the response status should be 200
    And I create a second customer actor named "otherCustomer"
    And I act as actor "anonymous"
    When I make a "GET" request to "/api/salons/{{salonId}}/availability?serviceId={{serviceId}}&date={{date}}&locationType=salon"
    Then the response status should be 200
    And response array "slots" should contain at least 1 items
    And I save response field "slots.0.startAt" as "otherBookingStartAt"
    And I act as actor "otherCustomer"
    When I make a "POST" request to "/api/appointments" with JSON body:
      """
      {
        "salonId": "{{salonId}}",
        "serviceId": "{{serviceId}}",
        "startAt": "{{otherBookingStartAt}}",
        "locationType": "salon"
      }
      """
    Then the response status should be 200
    And response field "status" should equal "pending"
    And response field "appointment.status" should equal "pending"
