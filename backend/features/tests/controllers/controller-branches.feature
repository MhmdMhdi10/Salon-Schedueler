Feature: Direct controller branch coverage
  Scenario: execute controller validation and error branches
    Given I have a running application
    When I exercise controller branch matrix
    Then this controller feature should have completed
