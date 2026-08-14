@flow-registration
Feature: Adaptive onboarding and operating models
  A salon can operate from a fixed place, a rented chair, a mobile route, or a
  hybrid model. The public booking policy must expose the matching capacity.

  @flow-fixed-salon
  Scenario: Fixed salon exposes a physical booking location
    Given I have an isolated "fixed_salon" salon named "Cucumber Fixed"
    When I make a "GET" request to "/api/salons/{{salonId}}/booking-policy"
    Then the response status should be 200
    And the response field "workMode" should equal "fixed_salon"
    And the response location types should include "salon"
    When I make a "GET" request to "/api/salons/{{salonId}}/chairs" as actor "owner"
    Then the response status should be 200
    And the response should include a chair with kind "physical"

  @flow-rented-chair
  Scenario: Solo rented-chair salon receives a hard physical assignment
    Given I have an isolated "rented_chair" salon named "Cucumber Rented"
    When I make a "GET" request to "/api/salons/{{salonId}}/booking-policy"
    Then the response status should be 200
    And the response field "workMode" should equal "rented_chair"
    And the response location types should include "salon"
    When I make a "GET" request to "/api/salons/{{salonId}}/staff" as actor "owner"
    Then the response status should be 200
    And the response field "staff.0.assignedChairId" should exist

  @flow-mobile
  Scenario: Mobile salon requires a customer location and creates a mobile lane
    Given I have an isolated "mobile" salon named "Cucumber Mobile"
    When I make a "GET" request to "/api/salons/{{salonId}}/booking-policy"
    Then the response status should be 200
    And the response field "workMode" should equal "mobile"
    And the response location types should include "customer"
    When I make a "GET" request to "/api/salons/{{salonId}}/chairs" as actor "owner"
    Then the response status should be 200
    And the response should include a chair with kind "mobile"

  @flow-hybrid @flow-owner-config
  Scenario: Owner can switch a salon to hybrid capacity
    Given I have an isolated "fixed_salon" salon named "Cucumber Hybrid"
    When I set the salon work mode to "hybrid" as actor "owner"
    Then the response status should be 200
    When I make a "GET" request to "/api/salons/{{salonId}}/booking-policy"
    Then the response status should be 200
    And the response field "workMode" should equal "hybrid"
    And the response location types should include "salon"
    And the response location types should include "customer"
