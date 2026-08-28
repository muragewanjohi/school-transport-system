# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Parent iOS lock-screen push |
| **Stack** | Flutter parent app + Deno `send-push` |
| **Owner path(s)** | `apps/parent_app/lib/services/parent_push_service.dart`, `apps/parent_app/lib/utils/parent_push_logic.dart`, `apps/parent_app/ios/Runner/RunnerRelease.entitlements`, `supabase/functions/send-push/index.ts` |
| **Started** | 2026-08-28 |
| **Status** | `passing` |

## Goal

iPhone lock-screen alerts require an APNs token before FCM `getToken()`. Inbox rows must not be treated as proof that APNs/FCM registered.

## Scenarios

```gherkin
Feature: Parent iOS lock-screen push

  Scenario: iOS waits for APNs before minting FCM
    Given the parent app is running on iOS
    And Apple has not yet issued an APNs device token
    When login tries to register FCM
    Then getToken is not called until an APNs token exists

  Scenario: iOS does not rotate FCM on every login
    Given the parent app is running on iOS
    When the parent logs in
    Then the existing FCM token is kept so the APNs mapping is not dropped

  Scenario: Android still rotates FCM on login
    Given the parent app is running on Android
    When the parent logs in
    Then a fresh FCM token is minted so UNREGISTERED tokens are not reused
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| iOS waits for APNs before minting FCM | `apps/parent_app/test/parent_push_logic_test.dart` | passing |
| iOS does not rotate FCM on every login | `apps/parent_app/test/parent_push_logic_test.dart` | passing |
| Android still rotates FCM on login | `apps/parent_app/test/parent_push_logic_test.dart` | passing |
