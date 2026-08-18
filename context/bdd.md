# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Parent onboarding and log out |
| **Stack** | `flutter` (`apps/parent_app`) |
| **Owner path(s)** | `apps/parent_app/lib/screens/onboarding_screen.dart`, `apps/parent_app/lib/utils/parent_onboarding_pages.dart`, `apps/parent_app/lib/widgets/logout_button.dart`, `apps/parent_app/lib/main.dart` |
| **Started** | 2026-08-18 |
| **Status** | `passing` |

## Goal

First launch shows three OnTheBus parent onboarding screens (live map, trip alerts, peace of mind) before login. Skip or Get started marks onboarding done and opens login. Profile always has a **Log out** button, including when no children are linked.

## Scenarios

```gherkin
Feature: Parent onboarding and log out

  Scenario: First launch shows the live-map onboarding page
    Given the parent has not finished onboarding
    When the app opens logged out
    Then the first screen title is Follow the bus
    And it is page 1 of 3

  Scenario: Last page uses Get started
    Given the parent is on onboarding page 3
    When they read the primary action
    Then the label is Get started
    And pages 1 and 2 use Next

  Scenario: Skip completes onboarding
    Given the parent is on an onboarding page
    When they tap Skip
    Then onboarding is marked complete

  Scenario: Profile always offers Log out
    Given the parent is on the Profile tab
    When the screen is shown
    Then a Log out action is visible
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| First launch shows the live-map onboarding page | `apps/parent_app/test/parent_onboarding_test.dart` | passing |
| Last page uses Get started | `apps/parent_app/test/parent_onboarding_test.dart` | passing |
| Skip completes onboarding | `apps/parent_app/test/parent_onboarding_test.dart` | passing |
| Profile always offers Log out | `apps/parent_app/test/logout_button_test.dart` | passing |
