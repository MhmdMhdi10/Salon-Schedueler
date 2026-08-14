@flow-ui-onboarding @flow-ui-booking
Feature: Critical browser journeys
  The real browser must render the public funnel and onboarding without runtime
  errors or horizontal overflow.

  @flow-ui-onboarding
  Scenario: Owner registration page is usable on desktop
    Given the dev API is healthy
    When I open "/business/register" in the browser
    Then the browser heading should contain "اول شما را بشناسیم"
    And the browser should have no horizontal overflow
    And the browser should have no runtime errors

  @flow-ui-booking
  Scenario: Public booking page is usable for the seeded salon
    Given the dev API is healthy
    When I open "/salon/11111111-1111-1111-1111-111111111111/book" in the browser
    Then the browser heading should contain "رزرو"
    And the browser should have no horizontal overflow
    And the browser should have no runtime errors

  @flow-failure-paths
  Scenario: Anonymous browser access to the customer account returns to auth
    Given the dev API is healthy
    When I open "/account" in the browser
    Then the browser URL should contain "/auth"
    And the browser should have no runtime errors
