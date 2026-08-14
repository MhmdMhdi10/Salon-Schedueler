@flow-rbac @flow-customer-account @flow-platform-admin
Feature: Tenant roles, customer account, and platform console
  Tenant boundaries and role permissions must hold at API level, not only in UI.

  @flow-rbac
  Scenario: Owner, admin, and stylist receive their scoped permissions
    Given I have an isolated "fixed_salon" salon named "Cucumber RBAC"
    And I create a customer actor named "customer"
    And I create an "Admin" actor named "admin"
    And I create a "Stylist" actor named "stylist"
    When I make a "GET" request to "/api/salons/{{salonId}}/staff" as actor "owner"
    Then the response status should be 200
    When I make a "GET" request to "/api/salons/{{salonId}}/analytics?from={{date}}&to={{futureDate}}" as actor "admin"
    Then the response status should be 200
    When I make a "GET" request to "/api/salons/{{salonId}}/analytics?from={{date}}&to={{futureDate}}" as actor "stylist"
    Then the response status should be 403
    When I make a "POST" request to "/api/salons/{{salonId}}/staff" as actor "admin" with body:
      """
      {"fullName":"Should Not Be Created","role":"Stylist","phone":"09123334455"}
      """
    Then the response status should be 403

  @flow-customer-account
  Scenario: Customer can read their account but cannot read the owner calendar
    Given I have an isolated "fixed_salon" salon named "Cucumber Customer"
    And I create a customer actor named "customer"
    When I make a "GET" request to "/api/customers/me/appointments" as actor "customer"
    Then the response status should be 200
    And the response array "appointments" should contain at least 0 item
    When I make a "GET" request to "/api/salons/{{salonId}}/calendar?from={{date}}&to={{futureDate}}&view=week" as actor "customer"
    Then the response status should be 403

  @flow-platform-admin
  Scenario: Active platform operator can access the global console
    Given I create a platform actor named "platform"
    When I make a "GET" request to "/api/platform-admin/dashboard" as actor "platform"
    Then the response status should be 200
    And the response field "metrics.totalSalons" should exist
    When I make a "GET" request to "/api/platform-admin/audit-logs" as actor "platform"
    Then the response status should be 200
