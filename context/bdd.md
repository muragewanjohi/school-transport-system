# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Parent iOS App Store prep (OnTheBus) |
| **Stack** | `flutter` (`apps/parent_app`) |
| **Owner path(s)** | `apps/parent_app/ios/Runner/Info.plist`, `apps/parent_app/android/app/src/main/AndroidManifest.xml`, `apps/parent_app/lib/widgets/delete_account_link.dart`, `codemagic.yaml` |
| **Started** | 2026-08-16 |
| **Status** | `passing` |

## Goal

Parents see the app as **OnTheBus** on iOS and Android, and can request account deletion in-app (Apple 5.1.1(v)) before the first TestFlight / App Store submit.

## Scenarios

```gherkin
Feature: Parent store identity and account deletion

  Scenario: Home-screen name is OnTheBus
    Given the parent app binary is installed
    When the user looks at the home-screen label
    Then the name is OnTheBus on iOS and Android
    And the Dart package and applicationId stay parent_app / com.schooltrack.parent_app

  Scenario: Parent requests account deletion
    Given a signed-in parent on the dashboard
    When they tap Delete my account
    Then the public delete-account page https://onthebusapp.com/delete-account opens

  Scenario: Delete-account page cannot open
    Given a signed-in parent on the dashboard
    When they tap Delete my account
    And the system cannot launch the URL
    Then they see Could not open account deletion page.
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Home-screen name is OnTheBus | `test/store_identity_test.dart` (plist + AndroidManifest labels) | `passing` |
| Parent requests account deletion | `test/delete_account_link_test.dart` | `passing` |
| Delete-account page cannot open | `test/delete_account_link_test.dart` | `passing` |
