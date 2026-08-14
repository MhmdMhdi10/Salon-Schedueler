@flow-booking-salon @flow-booking-approval @flow-booking-rejection @flow-cancellation @flow-booking-deposit
Feature: Customer booking and appointment lifecycle
  Booking always uses real availability and keeps the appointment state explicit.

  @flow-booking-salon
  Scenario: Customer books a salon slot and owner approves it
    Given I have an isolated "fixed_salon" salon named "Cucumber Booking"
    And I create a customer actor named "customer"
    When I book an available "salon" appointment as actor "customer"
    Then the response status should be 200
    And the response field "status" should equal "pending"
    And the response field "appointment.locationType" should equal "salon"
    When I approve the current appointment as actor "owner"
    Then the response status should be 200
    And the response field "status" should equal "confirmed"

  @flow-booking-approval
  Scenario: Owner grants a stylist approval permission for the stylist's own booking
    Given I have an isolated "fixed_salon" salon named "Cucumber Approval"
    And I create a customer actor named "customer"
    And I create a "Stylist" actor named "stylist"
    When I book an available "salon" appointment for actor "stylist" as actor "customer"
    And I approve the current appointment as actor "stylist"
    Then the response status should be 403
    When I grant actor "stylist" permission to approve own appointments
    And I approve the current appointment as actor "stylist"
    Then the response status should be 200
    And the response field "status" should equal "confirmed"

  @flow-booking-rejection
  Scenario: A permitted stylist can reject their own pending booking
    Given I have an isolated "fixed_salon" salon named "Cucumber Rejection"
    And I create a customer actor named "customer"
    And I create a "Stylist" actor named "stylist"
    When I book an available "salon" appointment for actor "stylist" as actor "customer"
    And I grant actor "stylist" permission to approve own appointments
    And I reject the current appointment as actor "stylist"
    Then the response status should be 200
    And the response field "status" should equal "cancelled"

  @flow-booking-mobile
  Scenario: Mobile booking stores the customer address and uses mobile capacity
    Given I have an isolated "mobile" salon named "Cucumber Mobile Booking"
    And I create a customer actor named "customer"
    When I book an available "customer" appointment as actor "customer"
    Then the response status should be 200
    And the response field "appointment.locationType" should equal "customer"
    And the response field "appointment.locationAddress" should contain "تهران"

  @flow-booking-deposit
  Scenario: Deposit service creates a held appointment with a payment redirect
    Given I have an isolated "fixed_salon" salon named "Cucumber Deposit"
    And I create a customer actor named "customer"
    When I make a "POST" request to "/api/salons/{{salonId}}/services" as actor "owner" with body:
      """
      {"name":"Cucumber Deposit Service","durationMinutes":30,"priceRial":900000,"requiresDeposit":true,"depositRial":100000}
      """
    Then the response status should be 201
    And I store response field "service.id" as variable "depositServiceId"
    When I make a "GET" request to "/api/salons/{{salonId}}/availability?serviceId={{depositServiceId}}&date={{futureDate}}"
    Then the response status should be 200
    And the response array "slots" should contain at least 1 item
    When I store response field "slots.0.startAt" as variable "depositStartAt"
    And I make a "POST" request to "/api/appointments" as actor "customer" with body:
      """
      {"salonId":"{{salonId}}","serviceId":"{{depositServiceId}}","startAt":"{{depositStartAt}}"}
      """
    Then the response status should be 200
    And the response field "status" should equal "held"
    And the response field "paymentRedirectUrl" should exist

  @flow-cancellation
  Scenario: Customer can cancel their own pending appointment
    Given I have an isolated "fixed_salon" salon named "Cucumber Cancellation"
    And I create a customer actor named "customer"
    When I book an available "salon" appointment as actor "customer"
    And I make a "POST" request to "/api/appointments/{{appointmentId}}/cancel" as actor "customer"
    Then the response status should be 200
    And the response field "status" should equal "cancelled"
