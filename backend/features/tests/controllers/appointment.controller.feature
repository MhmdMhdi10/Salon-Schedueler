Feature: Appointment controller HTTP contracts
  Scenario: exercise appointment lifecycle routes
    Given I have a controller fixture with an appointment
    When I exercise controller endpoint "POST /appointments"
    When I exercise controller endpoint "POST /appointments/:id/cancel"
    When I exercise controller endpoint "POST /salons/:id/appointments/manual"
    When I exercise controller endpoint "POST /appointments/:id/reschedule"
    When I exercise controller endpoint "POST /appointments/:id/no-show"
    When I exercise controller endpoint "POST /appointments/:id/approve"
    When I exercise controller endpoint "POST /appointments/:id/reject"
    When I exercise controller endpoint "PATCH /appointments/:id/reschedule"
    When I exercise controller endpoint "POST /appointments/:id/reschedule/accept"
    When I exercise controller endpoint "POST /appointments/:id/reschedule/reject"
    Then this controller feature should have completed
