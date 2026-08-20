# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Parent Home live card accuracy |
| **Stack** | Flutter |
| **Owner path(s)** | `apps/parent_app/lib/screens/dashboard_screen.dart`, `apps/parent_app/lib/utils/parent_grade_label.dart` |
| **Started** | 2026-08-20 |
| **Status** | `passing` |

## Goal

Home transit card shows live trip facts (child status, plate, driver, next stop, ETA) instead of placeholders. Grade label does not double-prefix "Grade".

## Scenarios

```gherkin
Feature: Parent home card accuracy

  Scenario: Grade label avoids double Grade prefix
    Given student grade is "Grade 2" and class is "Nile"
    When formatStudentGradeLabel runs
    Then the result is "Grade 2 Nile"
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| Grade label avoids double Grade prefix | `apps/parent_app/test/parent_grade_label_test.dart` | passing |
